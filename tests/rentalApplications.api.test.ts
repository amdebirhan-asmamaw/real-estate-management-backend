import request from "supertest";
import app from "../src/app";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";

const PASSWORD = "Password123";

const register = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/auth/register").send(body);

const tokenOf = (res: { body: { data: { tokens: { accessToken: string } } } }) =>
  res.body.data.tokens.accessToken;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const makeUser = async (email: string, role: string) =>
  tokenOf(await register({ name: "User", email, password: PASSWORD, role }));

const publishedRentListing = async (ownerToken: string): Promise<string> => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: "Application Ready Loft",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1800,
      location: { type: "Point", coordinates: [38.7, 9.0] },
    });
  const id = created.body.data.id;
  await Listing.findByIdAndUpdate(id, { status: "published" });
  return id;
};

describe("Rental applications API", () => {
  it("lets a tenant apply, schedule a viewing, and receive a lease draft", async () => {
    const owner = await makeUser("rental-owner@example.com", "property_owner");
    const tenant = await makeUser("rental-tenant@example.com", "tenant");
    const listingId = await publishedRentListing(owner);

    const submitted = await request(app)
      .post("/api/v1/rental-applications")
      .set(bearer(tenant))
      .send({
        listingId,
        desiredStartDate: "2026-07-01",
        occupants: 2,
        monthlyIncome: 6500,
        message: "We would love to apply.",
      });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe("submitted");
    const applicationId = submitted.body.data.id;

    const ownerNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(owner));
    expect(ownerNotifications.body.data.items[0].type).toBe("rental_application.received");

    const requested = await request(app)
      .patch(`/api/v1/rental-applications/${applicationId}/appointment`)
      .set(bearer(tenant))
      .send({ status: "requested", note: "Saturday works best." });
    expect(requested.status).toBe(200);
    expect(requested.body.data.appointment.status).toBe("requested");

    const scheduled = await request(app)
      .patch(`/api/v1/rental-applications/${applicationId}/appointment`)
      .set(bearer(owner))
      .send({
        status: "scheduled",
        scheduledFor: "2026-06-20T12:00:00.000Z",
        locationNote: "Meet in the lobby.",
      });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.data.appointment.status).toBe("scheduled");

    const approved = await request(app)
      .patch(`/api/v1/rental-applications/${applicationId}/review`)
      .set(bearer(owner))
      .send({ status: "approved", note: "Approved after screening." });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("approved");

    const leaseCreated = await request(app)
      .post(`/api/v1/rental-applications/${applicationId}/lease`)
      .set(bearer(owner))
      .send({
        monthlyRent: 1800,
        depositAmount: 3600,
        currency: "USD",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        terms: "Standard lease terms apply.",
      });
    expect(leaseCreated.status).toBe(201);
    expect(leaseCreated.body.data.status).toBe("lease_created");
    expect(leaseCreated.body.data.lease).toBeTruthy();

    const lease = await Lease.findById(leaseCreated.body.data.lease);
    expect(lease?.tenant.toString()).toBeTruthy();
    expect(lease?.status).toBe("draft");
  });

  it("blocks property owners from submitting rental applications", async () => {
    const owner = await makeUser("rental-owner2@example.com", "property_owner");
    const listingId = await publishedRentListing(owner);

    const res = await request(app)
      .post("/api/v1/rental-applications")
      .set(bearer(owner))
      .send({ listingId });

    expect(res.status).toBe(403);
  });
});
