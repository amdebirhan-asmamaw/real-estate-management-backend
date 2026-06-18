/**
 * Shared seed helpers for cross-module integration tests.
 * All helpers write to the real in-memory Mongo instance.
 */
import { User } from "../../src/modules/auth/auth.model";
import { Listing } from "../../src/modules/listings/listing.model";

export interface SeedUserOpts {
  role?: string;
  walletAddress?: string;
  kycStatus?: string;
  email?: string;
}

let _counter = 0;
const uid = () => `${Date.now()}-${++_counter}-${Math.random().toString(36).slice(2)}`;

export const seedUser = async (opts: SeedUserOpts = {}) =>
  User.create({
    name: "Integration User",
    email: opts.email ?? `integ-${uid()}@test.com`,
    password: "Password1!",
    role: opts.role ?? "tenant",
    kycStatus: opts.kycStatus ?? "verified",
    accountStatus: "active",
    ...(opts.walletAddress ? { walletAddress: opts.walletAddress } : {}),
  });

export const seedVerifiedUserWithWallet = async (role: string) =>
  seedUser({
    role,
    kycStatus: "verified",
    walletAddress: `0x${"a".repeat(39)}${_counter++}`,
  });

export const seedPublishedRentListing = async (createdBy: string) =>
  Listing.create({
    title: "Integration Rent Listing",
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    currency: "USD",
    monthlyRent: 1500,
    status: "published",
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy,
  });

export const seedPublishedSaleListing = async (
  createdBy: string,
  verificationStatus = "verified",
) =>
  Listing.create({
    title: "Integration Sale Listing",
    listingType: "sale",
    category: "residential",
    propertyType: "apartment",
    currency: "USD",
    price: 250000,
    status: "published",
    verificationStatus,
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy,
  });
