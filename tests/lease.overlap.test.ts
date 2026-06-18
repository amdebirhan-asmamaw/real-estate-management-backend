/**
 * Task 5b: lease overlap guard in createLease.
 *
 * createLease must reject a new lease if any non-terminal lease for the same
 * listing has a [startDate, endDate] interval that overlaps the requested
 * period. Non-terminal statuses: draft, proposed, active, disputed.
 * Terminal: completed, terminated, cancelled.
 */

// ── Mock chain layer to avoid needing a real RPC ─────────────────────────────
jest.mock("../src/core/blockchain/leaseEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  activateEscrow: jest.fn(async () => ({ txHash: "0xact" })),
  cancelEscrow: jest.fn(async () => ({ txHash: "0xcancel" })),
  releaseDeposit: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundDeposit: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));

import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";
import { AppError } from "../src/core/utils/AppError";
import * as service from "../src/modules/leases/lease.service";

// ── Seed helpers ──────────────────────────────────────────────────────────────

const makeUser = async () =>
  User.create({
    name: "Test User",
    email: `u-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password1!",
    role: "property_owner",
    kycStatus: "verified",
  });

const makeRentListing = async (createdBy: string) =>
  Listing.create({
    title: "Overlap Test Listing",
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    currency: "USD",
    monthlyRent: 1000,
    status: "published",
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy,
  });

const leaseInput = (
  listingId: string,
  tenantId: string,
  startDate: string,
  endDate: string,
) => ({
  listingId,
  tenantId,
  monthlyRent: 1000,
  depositAmount: 2000,
  currency: "USD",
  startDate,
  endDate,
  terms: "Standard",
});

describe("createLease overlap guard", () => {
  let landlord: Awaited<ReturnType<typeof makeUser>>;
  let tenant: Awaited<ReturnType<typeof makeUser>>;
  let listingId: string;

  beforeEach(async () => {
    landlord = await makeUser();
    tenant = await makeUser();
    const listing = await makeRentListing(landlord.id as string);
    listingId = listing.id as string;
  });

  it("creates a lease when no existing lease covers the period", async () => {
    const lease = await service.createLease(
      leaseInput(listingId, tenant.id as string, "2026-07-01", "2027-06-30"),
      landlord.id as string,
      "property_owner",
    );
    expect(lease.status).toBe("draft");
  });

  it("rejects a lease whose period overlaps an existing non-terminal lease", async () => {
    // First lease: Jul 2026 – Jun 2027
    await service.createLease(
      leaseInput(listingId, tenant.id as string, "2026-07-01", "2027-06-30"),
      landlord.id as string,
      "property_owner",
    );

    // Second lease: Jan 2027 – Dec 2027 — overlaps Jul 2026–Jun 2027
    await expect(
      service.createLease(
        leaseInput(listingId, tenant.id as string, "2027-01-01", "2027-12-31"),
        landlord.id as string,
        "property_owner",
      ),
    ).rejects.toBeInstanceOf(AppError);

    const err = await service
      .createLease(
        leaseInput(listingId, tenant.id as string, "2027-01-01", "2027-12-31"),
        landlord.id as string,
        "property_owner",
      )
      .catch((e: unknown) => e);

    expect((err as AppError).statusCode).toBe(409);
  });

  it("allows a non-overlapping lease on the same listing (adjacent period)", async () => {
    await service.createLease(
      leaseInput(listingId, tenant.id as string, "2026-07-01", "2027-06-30"),
      landlord.id as string,
      "property_owner",
    );

    // Starts the day AFTER the first lease ends — no overlap
    await expect(
      service.createLease(
        leaseInput(listingId, tenant.id as string, "2027-07-01", "2028-06-30"),
        landlord.id as string,
        "property_owner",
      ),
    ).resolves.toBeDefined();
  });

  it("allows an overlapping lease when the conflicting one is terminal (cancelled)", async () => {
    // Create first lease and cancel it
    const first = await service.createLease(
      leaseInput(listingId, tenant.id as string, "2026-07-01", "2027-06-30"),
      landlord.id as string,
      "property_owner",
    );
    await Lease.findByIdAndUpdate(first.id, { status: "cancelled" });

    // Same period — should now be allowed (cancelled is terminal)
    await expect(
      service.createLease(
        leaseInput(listingId, tenant.id as string, "2026-07-01", "2027-06-30"),
        landlord.id as string,
        "property_owner",
      ),
    ).resolves.toBeDefined();
  });
});
