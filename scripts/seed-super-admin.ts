/**
 * Seed script: creates the initial super_admin account.
 *
 * Usage:
 *   npx ts-node scripts/seed-super-admin.ts
 *
 * Environment variables (or defaults):
 *   SUPER_ADMIN_NAME      — defaults to "Super Admin"
 *   SUPER_ADMIN_EMAIL     — required
 *   SUPER_ADMIN_PASSWORD  — required
 *
 * Idempotent: skips creation if the email already exists.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { User } from "../src/modules/auth/auth.model";

const { MONGODB_URI, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME } = process.env;

async function seed() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is required");
    process.exit(1);
  }
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    console.error("❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required");
    console.error(
      "   Set them in .env or pass as environment variables:\n" +
      "   SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_PASSWORD=SecurePass1 npx ts-node scripts/seed-super-admin.ts"
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });
  if (existing) {
    console.log(`⚠️  User with email ${SUPER_ADMIN_EMAIL} already exists (role: ${existing.role}). Skipping.`);
    await mongoose.disconnect();
    return;
  }

  const superAdmin = await User.create({
    name: SUPER_ADMIN_NAME || "Super Admin",
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    role: "super_admin",
    accountStatus: "active",
    kycStatus: "verified",
    emailVerified: true,
  });

  console.log(`✅ Super admin created:`);
  console.log(`   ID:    ${superAdmin.id}`);
  console.log(`   Email: ${superAdmin.email}`);
  console.log(`   Role:  ${superAdmin.role}`);

  await mongoose.disconnect();
  console.log("✅ Done");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
