/**
 * Seeds default system permissions. Safe to run multiple times (upserts by key).
 *
 *   npx ts-node scripts/seed-permissions.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Permission } from "../src/modules/permissions/permission.model";
import { DEFAULT_PERMISSIONS } from "../src/modules/permissions/permission.constants";

dotenv.config();

const { MONGODB_URI } = process.env;

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  for (const def of DEFAULT_PERMISSIONS) {
    await Permission.findOneAndUpdate(
      { key: def.key },
      { $setOnInsert: def },
      { upsert: true, new: true },
    );
    console.log(`✓ ${def.key}`);
  }

  console.log(`\nSeeded ${DEFAULT_PERMISSIONS.length} permissions`);
  await mongoose.disconnect();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
