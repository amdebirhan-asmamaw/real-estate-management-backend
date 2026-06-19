import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Notification } from "../src/modules/notifications/notification.model";
import { SavedSearch } from "../src/modules/savedSearches/savedSearch.model";
import * as savedSearches from "../src/modules/savedSearches/savedSearch.service";

describe("saved search alerts", () => {
  it("notifies users when a published listing matches an enabled saved search", async () => {
    const tenant = await User.create({
      name: "Tenant",
      email: "saved-alert-tenant@example.com",
      password: "Password123",
      role: "tenant",
    });
    const owner = await User.create({
      name: "Owner",
      email: "saved-alert-owner@example.com",
      password: "Password123",
      role: "property_owner",
    });
    await SavedSearch.create({
      user: tenant.id,
      name: "Central rentals",
      query: {
        listingType: "rent",
        maxPrice: 2000,
        polygon: [
          [38.6, 8.9],
          [38.8, 8.9],
          [38.8, 9.1],
          [38.6, 9.1],
        ],
      },
      alertEnabled: true,
    });
    const listing = await Listing.create({
      title: "Central Apartment",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner.id,
    });

    const count = await savedSearches.notifyMatchingSavedSearches(listing);

    expect(count).toBe(1);
    const notification = await Notification.findOne({ recipient: tenant.id });
    expect(notification?.type).toBe("saved_search.match");
    expect(notification?.metadata?.listingId).toBe(listing.id);
  });

  it("does not duplicate alerts for the same listing and saved search", async () => {
    const tenant = await User.create({
      name: "Tenant",
      email: "saved-alert-dedupe@example.com",
      password: "Password123",
      role: "tenant",
    });
    const owner = await User.create({
      name: "Owner",
      email: "saved-alert-dedupe-owner@example.com",
      password: "Password123",
      role: "property_owner",
    });
    await SavedSearch.create({
      user: tenant.id,
      name: "Dedupe rentals",
      query: { listingType: "rent", maxPrice: 2000 },
      alertEnabled: true,
    });
    const listing = await Listing.create({
      title: "Dedupe Apartment",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner.id,
    });

    await expect(savedSearches.notifyMatchingSavedSearches(listing)).resolves.toBe(1);
    await expect(savedSearches.notifyMatchingSavedSearches(listing)).resolves.toBe(0);
    await expect(
      Notification.countDocuments({
        recipient: tenant.id,
        type: "saved_search.match",
      }),
    ).resolves.toBe(1);
  });

  it("runs catch-up alerts for recently updated published listings", async () => {
    const tenant = await User.create({
      name: "Tenant",
      email: "saved-alert-worker@example.com",
      password: "Password123",
      role: "tenant",
    });
    const owner = await User.create({
      name: "Owner",
      email: "saved-alert-worker-owner@example.com",
      password: "Password123",
      role: "property_owner",
    });
    await SavedSearch.create({
      user: tenant.id,
      name: "Worker rentals",
      query: { listingType: "rent", maxPrice: 2000 },
      alertEnabled: true,
    });
    await Listing.create({
      title: "Worker Apartment",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner.id,
    });

    const summary = await savedSearches.runSavedSearchAlerts({
      since: new Date(Date.now() - 60_000),
    });

    expect(summary.listingsChecked).toBe(1);
    expect(summary.notificationsCreated).toBe(1);
  });

  it("skips disabled saved searches", async () => {
    const tenant = await User.create({
      name: "Tenant",
      email: "saved-alert-disabled@example.com",
      password: "Password123",
      role: "tenant",
    });
    const owner = await User.create({
      name: "Owner",
      email: "saved-alert-owner2@example.com",
      password: "Password123",
      role: "property_owner",
    });
    await SavedSearch.create({
      user: tenant.id,
      name: "Quiet rentals",
      query: { listingType: "rent" },
      alertEnabled: false,
    });
    const listing = await Listing.create({
      title: "Quiet Apartment",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner.id,
    });

    const count = await savedSearches.notifyMatchingSavedSearches(listing);

    expect(count).toBe(0);
    await expect(Notification.countDocuments({ recipient: tenant.id })).resolves.toBe(0);
  });
});
