/**
 * Seed script — creates one user per role with predictable credentials.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-users.ts
 *
 * Environment:
 *   Requires MONGO_URI (or defaults to mongodb://localhost:27017/real-estate-dev).
 */

import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../modules/auth/auth.model";
import { env } from "../core/config/env";

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: "super_admin" | "admin" | "property_owner" | "tenant";
  accountStatus: "active" | "pending";
  kycStatus: "verified" | "not_started";
  emailVerified: boolean;
  phone?: string;
}

const seedUsers: SeedUser[] = [
  {
    name: "Super Admin",
    email: "superadmin@realestate.dev",
    password: "SuperAdmin1!",
    role: "super_admin",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000001",
  },
  {
    name: "Platform Admin",
    email: "admin@realestate.dev",
    password: "PlatformAdmin1!",
    role: "admin",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000002",
  },
  {
    name: "John Owner",
    email: "owner@realestate.dev",
    password: "PropertyOwner1!",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000003",
  },
  {
    name: "Jane Tenant",
    email: "tenant@realestate.dev",
    password: "TenantUser1!",
    role: "tenant",
    accountStatus: "active",
    kycStatus: "not_started",
    emailVerified: true,
    phone: "+251900000004",
  },
  {
    name: "Abebe Kebede",
    email: "abebe@realestate.dev",
    password: "AbebeOwner1!",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000005",
  },
  {
    name: "Tigist Haile",
    email: "tigist@realestate.dev",
    password: "TigistOwner1!",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000006",
  },
  {
    name: "Dawit Mekonnen",
    email: "dawit@realestate.dev",
    password: "DawitOwner1!",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000007",
  },
  {
    name: "Sara Bekele",
    email: "sara@realestate.dev",
    password: "SaraOwner1!",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
    phone: "+251900000008",
  },
];

async function seed(): Promise<void> {
  const uri = env.MONGODB_URI || "mongodb://localhost:27017/real-estate-dev";
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);

  for (const data of seedUsers) {
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      console.log(`⏭  Skipped (exists): ${data.email} [${data.role}]`);
      continue;
    }

    const user = new User(data);
    // password hashing is handled by the pre-save hook in the model
    await user.save();
    console.log(`✅ Created: ${data.email} [${data.role}]`);
  }

  await mongoose.disconnect();
  console.log("\nSeed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
