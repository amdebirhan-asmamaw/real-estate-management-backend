import request from "supertest";
import app from "../src/app";
import { Listing } from "../src/modules/listings/listing.model";
import { ListingEvent } from "../src/modules/listingAnalytics/listingEvent.model";
import { User } from "../src/modules/auth/auth.model";
import { GeoCache, Neighborhood, POI } from "../src/modules/geo/geo.model";

describe("Geo API", () => {
  it("geocodes with the mock provider and caches results", async () => {
    const first = await request(app)
      .get("/api/v1/geo/geocode")
      .query({ q: "Bole, Addis Ababa" })
      .expect(200);

    expect(first.body.data[0].provider).toBe("mock");
    expect(first.body.data[0].location.coordinates).toHaveLength(2);
    await expect(GeoCache.countDocuments()).resolves.toBe(1);

    await request(app)
      .get("/api/v1/geo/geocode")
      .query({ q: "Bole, Addis Ababa" })
      .expect(200);
    await expect(GeoCache.countDocuments()).resolves.toBe(1);
  });

  it("reverse geocodes coordinates", async () => {
    const res = await request(app)
      .get("/api/v1/geo/reverse")
      .query({ lat: 9.01, lng: 38.76 })
      .expect(200);

    expect(res.body.data.location.coordinates).toEqual([38.76, 9.01]);
  });

  it("returns neighborhood analytics from listings, POIs, and lead activity", async () => {
    const owner = await User.create({
      name: "Owner",
      email: "geo-owner@example.com",
      password: "Password123",
      role: "property_owner",
    });
    const tenant = await User.create({
      name: "Tenant",
      email: "geo-tenant@example.com",
      password: "Password123",
      role: "tenant",
    });
    const neighborhood = await Neighborhood.create({
      name: "Bole",
      city: "Addis Ababa",
      country: "Ethiopia",
      boundary: {
        type: "Polygon",
        coordinates: [[
          [38.7, 8.95],
          [38.85, 8.95],
          [38.85, 9.08],
          [38.7, 9.08],
          [38.7, 8.95],
        ]],
      },
      centroid: { type: "Point", coordinates: [38.76, 9.01] },
    });
    const listing = await Listing.create({
      title: "Bole Apartment",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1200,
      status: "published",
      location: { type: "Point", coordinates: [38.76, 9.01] },
      createdBy: owner.id,
    });
    await ListingEvent.create({
      listing: listing.id,
      owner: owner.id,
      actor: tenant.id,
      eventType: "inquiry",
    });
    await POI.create({
      name: "Bole Transit",
      category: "transit",
      location: { type: "Point", coordinates: [38.761, 9.011] },
    });

    const res = await request(app)
      .get(`/api/v1/geo/neighborhoods/${neighborhood.id}/analytics`)
      .expect(200);

    expect(res.body.data.neighborhood.name).toBe("Bole");
    expect(res.body.data.listings[0].count).toBe(1);
    expect(res.body.data.leads[0].count).toBe(1);
    expect(res.body.data.poiCount).toBe(1);
  });
});

describe("Listing clusters API", () => {
  it("groups published listings inside the requested viewport", async () => {
    const owner = await User.create({
      name: "Owner",
      email: "cluster-owner@example.com",
      password: "Password123",
      role: "property_owner",
    });
    await Listing.create([
      {
        title: "Cluster One",
        listingType: "rent",
        category: "residential",
        propertyType: "apartment",
        monthlyRent: 1000,
        status: "published",
        location: { type: "Point", coordinates: [38.75, 9.0] },
        createdBy: owner.id,
      },
      {
        title: "Cluster Two",
        listingType: "rent",
        category: "residential",
        propertyType: "apartment",
        monthlyRent: 1400,
        status: "published",
        location: { type: "Point", coordinates: [38.751, 9.001] },
        createdBy: owner.id,
      },
    ]);

    const res = await request(app)
      .get("/api/v1/listings/clusters")
      .query({
        swLng: 38.7,
        swLat: 8.9,
        neLng: 38.8,
        neLat: 9.1,
        zoom: 10,
        listingType: "rent",
      })
      .expect(200);

    const total = res.body.data.reduce(
      (sum: number, item: { count: number }) => sum + item.count,
      0,
    );
    expect(total).toBe(2);
  });
});
