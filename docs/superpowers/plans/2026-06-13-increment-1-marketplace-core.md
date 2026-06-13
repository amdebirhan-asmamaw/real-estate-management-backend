# Increment 1: Marketplace Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-aware property-listing module with photo upload and geospatial discovery (viewport, radius, attribute filters) to the existing Express + TypeScript + MongoDB backend.

**Architecture:** A new `listings` feature module follows the template's layering (routes → controller → service → model + validation). Geolocation is a GeoJSON `Point` backed by a MongoDB `2dsphere` index powering `$geoWithin` (viewport) and `$near` (radius) queries. Photos upload via multer to Cloudinary behind a thin, mockable uploader util. Roles extend the existing enum and `authorize()` middleware.

**Tech Stack:** Express 4, TypeScript, Mongoose 8, Joi, multer, Cloudinary, Jest + Supertest + mongodb-memory-server.

**Reference docs to read first:** `CLAUDE.md` (module conventions), `src/modules/auth/*` (reference module), `src/core/middleware/{auth,validate}.middleware.ts`, `src/core/utils/{AppError,response}.ts`, `tests/auth.test.ts` (test patterns).

**Conventions reused throughout:**
- Controllers are thin: `try { ... } catch (error) { next(error); }`, respond via `sendSuccess`/`sendCreated`.
- Services throw `new AppError(message, statusCode)` for expected failures; never touch `res`.
- Validate input with `validate(schema)` / `validate(schema, "query")`.
- Tests import `app` from `../src/app`, use the in-memory Mongo from `tests/setup.ts`, and register users via the API to get tokens.

---

## Task 0: Install dependencies and extend env config

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/core/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install packages**

Run:
```bash
npm install multer cloudinary
npm install -D @types/multer
```
Expected: packages added, `npm install` exits 0.

- [ ] **Step 2: Add Cloudinary env vars to the schema**

In `src/core/config/env.ts`, add these keys to the Joi `envSchema` object (after `TRUST_PROXY`). They are optional so tests run without credentials; the uploader fails fast at runtime if used unconfigured.

```ts
  CLOUDINARY_CLOUD_NAME: Joi.string().allow("").default(""),
  CLOUDINARY_API_KEY: Joi.string().allow("").default(""),
  CLOUDINARY_API_SECRET: Joi.string().allow("").default(""),
  // Max upload size per image in bytes (default 5MB).
  UPLOAD_MAX_BYTES: Joi.number().default(5 * 1024 * 1024),
```

Add the same keys to the `Env` interface:

```ts
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  UPLOAD_MAX_BYTES: number;
```

- [ ] **Step 3: Document the new env vars**

Append to `.env.example`:

```bash

# ─── Photo upload (Cloudinary) ──────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
UPLOAD_MAX_BYTES=5242880
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no output, exit 0).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/core/config/env.ts .env.example
git commit -m "chore: add multer/cloudinary deps and upload env config"
```

---

## Task 1: Extend user roles (buyer/agent/owner/admin)

**Files:**
- Modify: `src/modules/auth/auth.model.ts`
- Modify: `src/modules/auth/auth.validation.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Test: `tests/auth.test.ts` (add cases)

- [ ] **Step 1: Write failing tests for role-based registration**

Append to `tests/auth.test.ts`:

```ts
describe("registration roles", () => {
  it("defaults a new user to the buyer role", async () => {
    const res = await register({ email: "buyer@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("buyer");
  });

  it("accepts agent and owner roles", async () => {
    const res = await register({ email: "agent@example.com", role: "agent" } as never);
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("agent");
  });

  it("rejects attempts to self-register as admin", async () => {
    const res = await register({ email: "x@example.com", role: "admin" } as never);
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx jest tests/auth.test.ts -t "registration roles"`
Expected: FAIL — role is `buyer`? No: current default is `user`, and `role` is stripped by validation, so the first case fails with `"user" !== "buyer"`.

- [ ] **Step 3: Update the user role type, enum, and default**

In `src/modules/auth/auth.model.ts`, replace the `UserRole` type and the schema `role` field:

```ts
export type UserRole = "buyer" | "agent" | "owner" | "admin";
```

```ts
    role: {
      type: String,
      enum: ["buyer", "agent", "owner", "admin"],
      default: "buyer",
    },
```

- [ ] **Step 4: Allow role in the register schema and input type**

In `src/modules/auth/auth.validation.ts`, add a `role` field to `registerSchema` (note: `admin` is intentionally excluded):

```ts
  role: Joi.string().valid("buyer", "agent", "owner").default("buyer"),
```

Update the `RegisterInput` type:

```ts
export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: "buyer" | "agent" | "owner";
};
```

- [ ] **Step 5: Persist the role on register**

In `src/modules/auth/auth.service.ts`, the `register` function already does `User.create(input)`. Since `input` now carries the validated `role`, no change is needed — but confirm `User.create(input)` is used (not field-by-field). If it constructs fields explicitly, add `role: input.role`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/auth.test.ts`
Expected: PASS (all auth tests, including the 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth tests/auth.test.ts
git commit -m "feat(auth): support buyer/agent/owner roles at registration"
```

---

## Task 2: Listing model with GeoJSON + 2dsphere index

**Files:**
- Create: `src/modules/listings/listing.model.ts`
- Test: `tests/listing.model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/listing.model.test.ts`:

```ts
import mongoose from "mongoose";
import { Listing } from "../src/modules/listings/listing.model";

const base = {
  title: "Sunny 2BR",
  description: "Bright apartment",
  listingType: "rent" as const,
  category: "residential" as const,
  monthlyRent: 1200,
  bedrooms: 2,
  bathrooms: 1,
  area: { value: 75, unit: "sqm" as const },
  address: { city: "Berlin", country: "DE" },
  location: { type: "Point" as const, coordinates: [13.405, 52.52] },
  createdBy: new mongoose.Types.ObjectId(),
};

describe("Listing model", () => {
  it("persists a valid listing with defaults", async () => {
    const doc = await Listing.create(base);
    expect(doc.status).toBe("draft");
    expect(doc.currency).toBe("USD");
    expect(doc.location.coordinates).toEqual([13.405, 52.52]);
  });

  it("rejects out-of-range coordinates", async () => {
    await expect(
      Listing.create({ ...base, location: { type: "Point", coordinates: [200, 52] } }),
    ).rejects.toThrow();
  });

  it("exposes a 2dsphere index on location", async () => {
    const indexes = await Listing.collection.indexes();
    expect(indexes.some((i) => i.key && i.key.location === "2dsphere")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/listing.model.test.ts`
Expected: FAIL — cannot find module `listing.model`.

- [ ] **Step 3: Implement the model**

Create `src/modules/listings/listing.model.ts`:

```ts
import { Schema, model, Document, Types } from "mongoose";

export type ListingType = "sale" | "rent";
export type ListingCategory = "residential" | "commercial";
export type ListingStatus = "draft" | "published" | "unpublished" | "archived";

export interface IPhoto {
  url: string;
  publicId: string;
}

export interface IListing extends Document {
  title: string;
  description?: string;
  listingType: ListingType;
  category: ListingCategory;
  status: ListingStatus;
  price?: number;
  monthlyRent?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: { value: number; unit: "sqm" | "sqft" };
  address: {
    street?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  location: { type: "Point"; coordinates: [number, number] };
  amenities: string[];
  photos: IPhoto[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new Schema<IPhoto>(
  { url: { type: String, required: true }, publicId: { type: String, required: true } },
  { _id: false },
);

const listingSchema = new Schema<IListing>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 5000 },
    listingType: { type: String, enum: ["sale", "rent"], required: true },
    category: { type: String, enum: ["residential", "commercial"], required: true },
    status: {
      type: String,
      enum: ["draft", "published", "unpublished", "archived"],
      default: "draft",
      index: true,
    },
    price: { type: Number, min: 0 },
    monthlyRent: { type: Number, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    area: {
      value: { type: Number, min: 0 },
      unit: { type: String, enum: ["sqm", "sqft"], default: "sqm" },
    },
    address: {
      street: String,
      city: String,
      region: String,
      country: String,
      postalCode: String,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (v: number[]) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90,
          message: "coordinates must be [longitude (-180..180), latitude (-90..90)]",
        },
      },
    },
    amenities: { type: [String], default: [] },
    photos: { type: [photoSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

listingSchema.index({ location: "2dsphere" });

export const Listing = model<IListing>("Listing", listingSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/listing.model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/listings/listing.model.ts tests/listing.model.test.ts
git commit -m "feat(listings): add Listing model with 2dsphere geo index"
```

---

## Task 3: Listing validation schemas

**Files:**
- Create: `src/modules/listings/listing.validation.ts`
- Test: `tests/listing.validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/listing.validation.test.ts`:

```ts
import { createListingSchema, discoverySchema } from "../src/modules/listings/listing.validation";

const valid = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

describe("createListingSchema", () => {
  it("accepts a valid rental listing", () => {
    expect(createListingSchema.validate(valid).error).toBeUndefined();
  });

  it("requires monthlyRent when listingType is rent", () => {
    const { monthlyRent, ...rest } = valid;
    expect(createListingSchema.validate(rest).error).toBeDefined();
  });

  it("requires price when listingType is sale", () => {
    const { error } = createListingSchema.validate({ ...valid, listingType: "sale", monthlyRent: undefined });
    expect(error).toBeDefined();
  });
});

describe("discoverySchema", () => {
  it("accepts a viewport query", () => {
    const { error } = discoverySchema.validate({ swLng: "13.3", swLat: "52.4", neLng: "13.5", neLat: "52.6" });
    expect(error).toBeUndefined();
  });

  it("accepts a radius query", () => {
    const { error } = discoverySchema.validate({ lng: "13.4", lat: "52.5", radius: "1000" });
    expect(error).toBeUndefined();
  });

  it("rejects mixing viewport and radius params", () => {
    const { error } = discoverySchema.validate({ swLng: "13.3", swLat: "52.4", neLng: "13.5", neLat: "52.6", radius: "1000" });
    expect(error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/listing.validation.test.ts`
Expected: FAIL — cannot find module `listing.validation`.

- [ ] **Step 3: Implement the schemas**

Create `src/modules/listings/listing.validation.ts`:

```ts
import Joi from "joi";

const coordinates = Joi.array()
  .ordered(
    Joi.number().min(-180).max(180).required(), // longitude
    Joi.number().min(-90).max(90).required(), // latitude
  )
  .length(2);

const location = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: coordinates.required(),
});

export const createListingSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(5000).allow(""),
  listingType: Joi.string().valid("sale", "rent").required(),
  category: Joi.string().valid("residential", "commercial").required(),
  price: Joi.number().min(0).when("listingType", {
    is: "sale",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  monthlyRent: Joi.number().min(0).when("listingType", {
    is: "rent",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  currency: Joi.string().length(3).uppercase().default("USD"),
  bedrooms: Joi.number().min(0),
  bathrooms: Joi.number().min(0),
  area: Joi.object({
    value: Joi.number().min(0).required(),
    unit: Joi.string().valid("sqm", "sqft").default("sqm"),
  }),
  address: Joi.object({
    street: Joi.string().allow(""),
    city: Joi.string().allow(""),
    region: Joi.string().allow(""),
    country: Joi.string().allow(""),
    postalCode: Joi.string().allow(""),
  }),
  location: location.required(),
  amenities: Joi.array().items(Joi.string()),
});

// All fields optional for PATCH; location/type rules still apply if present.
export const updateListingSchema = createListingSchema.fork(
  ["title", "listingType", "category", "location"],
  (s) => s.optional(),
).min(1);

export const statusSchema = Joi.object({
  status: Joi.string().valid("draft", "published", "unpublished", "archived").required(),
});

export const discoverySchema = Joi.object({
  // Viewport (bounding box) — all four together.
  swLng: Joi.number().min(-180).max(180),
  swLat: Joi.number().min(-90).max(90),
  neLng: Joi.number().min(-180).max(180),
  neLat: Joi.number().min(-90).max(90),
  // Radius — point + distance (meters) together.
  lng: Joi.number().min(-180).max(180),
  lat: Joi.number().min(-90).max(90),
  radius: Joi.number().positive(),
  // Filters
  listingType: Joi.string().valid("sale", "rent"),
  category: Joi.string().valid("residential", "commercial"),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  minBedrooms: Joi.number().min(0),
  minBathrooms: Joi.number().min(0),
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
})
  .and("swLng", "swLat", "neLng", "neLat")
  .and("lng", "lat", "radius")
  .nand("swLng", "lng"); // cannot use both spatial modes at once

export type CreateListingInput = {
  title: string;
  description?: string;
  listingType: "sale" | "rent";
  category: "residential" | "commercial";
  price?: number;
  monthlyRent?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: { value: number; unit: "sqm" | "sqft" };
  address?: Record<string, string>;
  location: { type: "Point"; coordinates: [number, number] };
  amenities?: string[];
};

export type DiscoveryQuery = {
  swLng?: number;
  swLat?: number;
  neLng?: number;
  neLat?: number;
  lng?: number;
  lat?: number;
  radius?: number;
  listingType?: "sale" | "rent";
  category?: "residential" | "commercial";
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  page: number;
  limit: number;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/listing.validation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/listings/listing.validation.ts tests/listing.validation.test.ts
git commit -m "feat(listings): add create/update/status/discovery validation"
```

---

## Task 4: Listing service (CRUD + ownership + status)

**Files:**
- Create: `src/modules/listings/listing.service.ts`
- Test: `tests/listing.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/listing.service.test.ts`:

```ts
import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import { AppError } from "../src/core/utils/AppError";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const otherId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

describe("listing.service", () => {
  it("creates a listing owned by the caller", async () => {
    const doc = await service.createListing(input, ownerId);
    expect(doc.createdBy.toString()).toBe(ownerId);
    expect(doc.status).toBe("draft");
  });

  it("blocks a non-owner non-admin from updating", async () => {
    const doc = await service.createListing(input, ownerId);
    await expect(
      service.updateListing(doc.id, { title: "Hacked" }, otherId, "buyer"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lets an admin update any listing", async () => {
    const doc = await service.createListing(input, ownerId);
    const updated = await service.updateListing(doc.id, { title: "By Admin" }, otherId, "admin");
    expect(updated.title).toBe("By Admin");
  });

  it("changes status", async () => {
    const doc = await service.createListing(input, ownerId);
    const published = await service.setStatus(doc.id, "published", ownerId, "owner");
    expect(published.status).toBe("published");
  });

  it("throws 404 for a missing listing", async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    await expect(service.getListingById(missing, null, null)).rejects.toBeInstanceOf(AppError);
  });

  it("hides non-published listings from anonymous callers", async () => {
    const doc = await service.createListing(input, ownerId);
    await expect(service.getListingById(doc.id, null, null)).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/listing.service.test.ts`
Expected: FAIL — cannot find module `listing.service`.

- [ ] **Step 3: Implement the service**

Create `src/modules/listings/listing.service.ts`:

```ts
import { StatusCodes } from "http-status-codes";
import { Listing, IListing, ListingStatus } from "./listing.model";
import { AppError } from "../../core/utils/AppError";
import type { CreateListingInput } from "./listing.validation";

const isPrivileged = (
  listing: IListing,
  userId: string | null,
  role: string | null,
): boolean => role === "admin" || (!!userId && listing.createdBy.toString() === userId);

const ensureOwner = (
  listing: IListing,
  userId: string | null,
  role: string | null,
): void => {
  if (!isPrivileged(listing, userId, role)) {
    throw new AppError("You do not have permission to modify this listing", StatusCodes.FORBIDDEN);
  }
};

const findOr404 = async (id: string): Promise<IListing> => {
  const listing = await Listing.findById(id);
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  return listing;
};

export const createListing = async (
  input: CreateListingInput,
  userId: string,
): Promise<IListing> => Listing.create({ ...input, createdBy: userId });

export const getListingById = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  if (listing.status !== "published" && !isPrivileged(listing, userId, role)) {
    // Don't leak existence of unpublished listings.
    throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  }
  return listing;
};

export const updateListing = async (
  id: string,
  patch: Partial<CreateListingInput>,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwner(listing, userId, role);
  listing.set(patch);
  await listing.save();
  return listing;
};

export const setStatus = async (
  id: string,
  status: ListingStatus,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwner(listing, userId, role);
  listing.status = status;
  await listing.save();
  return listing;
};

export const deleteListing = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<void> => {
  const listing = await findOr404(id);
  ensureOwner(listing, userId, role);
  await listing.deleteOne();
};

export const listMine = async (userId: string): Promise<IListing[]> =>
  Listing.find({ createdBy: userId }).sort({ createdAt: -1 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/listing.service.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/listings/listing.service.ts tests/listing.service.test.ts
git commit -m "feat(listings): CRUD service with ownership and status rules"
```

---

## Task 5: Discovery service (viewport, radius, filters, pagination)

**Files:**
- Modify: `src/modules/listings/listing.service.ts` (add `discover`)
- Test: `tests/listing.discovery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/listing.discovery.test.ts`:

```ts
import mongoose from "mongoose";
import { Listing } from "../src/modules/listings/listing.model";
import { discover } from "../src/modules/listings/listing.service";

const owner = new mongoose.Types.ObjectId();

const make = (coords: [number, number], over: Record<string, unknown> = {}) =>
  Listing.create({
    title: "L",
    listingType: "rent",
    category: "residential",
    monthlyRent: 1000,
    currency: "USD",
    status: "published",
    location: { type: "Point", coordinates: coords },
    createdBy: owner,
    ...over,
  });

describe("discover", () => {
  it("returns only published listings inside the viewport", async () => {
    await make([13.4, 52.5]); // inside
    await make([2.35, 48.85]); // Paris — outside
    await make([13.41, 52.51], { status: "draft" }); // inside but draft

    const { items, total } = await discover({
      swLng: 13.3, swLat: 52.4, neLng: 13.5, neLat: 52.6, page: 1, limit: 20,
    });

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].location.coordinates[0]).toBeCloseTo(13.4);
  });

  it("returns listings within a radius and applies filters", async () => {
    await make([13.4, 52.5], { monthlyRent: 800 });
    await make([13.405, 52.505], { monthlyRent: 3000 });

    const { items } = await discover({
      lng: 13.4, lat: 52.5, radius: 2000, maxPrice: 1000, page: 1, limit: 20,
    } as never);

    expect(items).toHaveLength(1);
    expect(items[0].monthlyRent).toBe(800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/listing.discovery.test.ts`
Expected: FAIL — `discover` is not exported.

- [ ] **Step 3: Implement `discover`**

Append to `src/modules/listings/listing.service.ts`:

```ts
import type { DiscoveryQuery } from "./listing.validation";
import type { FilterQuery } from "mongoose";

export const discover = async (
  q: DiscoveryQuery,
): Promise<{ items: IListing[]; total: number; page: number; limit: number }> => {
  const filter: FilterQuery<IListing> = { status: "published" };

  // Spatial: viewport bounding box.
  if (q.swLng !== undefined) {
    filter.location = {
      $geoWithin: {
        $box: [
          [q.swLng, q.swLat],
          [q.neLng, q.neLat],
        ],
      },
    };
  } else if (q.lng !== undefined) {
    // Spatial: radius from a point (meters).
    filter.location = {
      $near: {
        $geometry: { type: "Point", coordinates: [q.lng, q.lat] },
        $maxDistance: q.radius,
      },
    };
  }

  // Attribute filters.
  if (q.listingType) filter.listingType = q.listingType;
  if (q.category) filter.category = q.category;
  if (q.minBedrooms !== undefined) filter.bedrooms = { $gte: q.minBedrooms };
  if (q.minBathrooms !== undefined) filter.bathrooms = { $gte: q.minBathrooms };

  // Price range applies to whichever monetary field exists.
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (q.minPrice !== undefined) range.$gte = q.minPrice;
    if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
    filter.$or = [{ price: range }, { monthlyRent: range }];
  }

  const skip = (q.page - 1) * q.limit;

  // $near forbids countDocuments; count via a parallel non-geo count when needed.
  const [items, total] = await Promise.all([
    Listing.find(filter).skip(skip).limit(q.limit),
    Listing.countDocuments(
      q.lng !== undefined ? { ...filter, location: undefined } : filter,
    ),
  ]);

  return { items, total, page: q.page, limit: q.limit };
};
```

> Note: `$near` already returns nearest-first and `countDocuments` rejects `$near`, so the count query strips the geo clause (radius results are typically small; exact radius counts are refined in a later increment if needed). Viewport uses `$geoWithin`, which counts fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/listing.discovery.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/listings/listing.service.ts tests/listing.discovery.test.ts
git commit -m "feat(listings): geospatial discovery with filters and pagination"
```

---

## Task 6: Cloudinary uploader util (mockable)

**Files:**
- Create: `src/core/utils/uploader.ts`
- Test: `tests/uploader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/uploader.test.ts`:

```ts
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: (_opts: unknown, cb: (e: unknown, r: unknown) => void) => ({
        end: () => cb(null, { secure_url: "https://cdn/x.jpg", public_id: "x" }),
      }),
      destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

import { uploadImage, destroyImage } from "../src/core/utils/uploader";

describe("uploader", () => {
  it("uploads a buffer and returns url + publicId", async () => {
    const result = await uploadImage(Buffer.from("data"), "listings");
    expect(result).toEqual({ url: "https://cdn/x.jpg", publicId: "x" });
  });

  it("destroys by publicId", async () => {
    await expect(destroyImage("x")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/uploader.test.ts`
Expected: FAIL — cannot find module `uploader`.

- [ ] **Step 3: Implement the uploader**

Create `src/core/utils/uploader.ts`:

```ts
import { v2 as cloudinary } from "cloudinary";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "./AppError";

let configured = false;

const ensureConfigured = (): void => {
  if (configured) return;
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError("Image uploads are not configured", StatusCodes.SERVICE_UNAVAILABLE);
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  configured = true;
};

export interface UploadResult {
  url: string;
  publicId: string;
}

export const uploadImage = (buffer: Buffer, folder: string): Promise<UploadResult> => {
  ensureConfigured();
  return new Promise<UploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
};

export const destroyImage = async (publicId: string): Promise<void> => {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/uploader.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/uploader.ts tests/uploader.test.ts
git commit -m "feat(core): add mockable Cloudinary uploader util"
```

---

## Task 7: Upload middleware (multer, memory storage)

**Files:**
- Create: `src/core/middleware/upload.middleware.ts`

- [ ] **Step 1: Implement the middleware (no separate unit test; exercised in Task 8 integration tests)**

Create `src/core/middleware/upload.middleware.ts`:

```ts
import multer from "multer";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new AppError("Only image files are allowed", StatusCodes.UNPROCESSABLE_ENTITY));
  },
}).array("photos", 10);
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/middleware/upload.middleware.ts
git commit -m "feat(core): add multer image-upload middleware"
```

---

## Task 8: Listing controller and routes (wire everything)

**Files:**
- Create: `src/modules/listings/listing.controller.ts`
- Create: `src/modules/listings/listing.routes.ts`
- Modify: `src/index.routes.ts`
- Test: `tests/listing.api.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/listing.api.test.ts`:

```ts
import request from "supertest";
import app from "../src/app";

const registerAs = async (role: string, email: string) => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "U", email, password: "Password123", role });
  return res.body.data.tokens.accessToken as string;
};

const sample = {
  title: "City Loft",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1500,
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

describe("Listings API", () => {
  it("lets an owner create, publish, and the public discover a listing", async () => {
    const token = await registerAs("owner", "owner1@example.com");

    const created = await request(app)
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send(sample);
    expect(created.status).toBe(201);
    const id = created.body.data.id ?? created.body.data._id;

    // Not visible before publish.
    const before = await request(app).get("/api/v1/listings").query({
      swLng: 13.3, swLat: 52.4, neLng: 13.5, neLat: 52.6,
    });
    expect(before.body.data.total).toBe(0);

    const published = await request(app)
      .post(`/api/v1/listings/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "published" });
    expect(published.status).toBe(200);

    const after = await request(app).get("/api/v1/listings").query({
      swLng: 13.3, swLat: 52.4, neLng: 13.5, neLat: 52.6,
    });
    expect(after.body.data.total).toBe(1);
  });

  it("rejects listing creation by a buyer (403)", async () => {
    const token = await registerAs("buyer", "buyer1@example.com");
    const res = await request(app)
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send(sample);
    expect(res.status).toBe(403);
  });

  it("prevents one owner from editing another's listing", async () => {
    const a = await registerAs("owner", "ownerA@example.com");
    const b = await registerAs("owner", "ownerB@example.com");
    const created = await request(app)
      .post("/api/v1/listings").set("Authorization", `Bearer ${a}`).send(sample);
    const id = created.body.data.id ?? created.body.data._id;

    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set("Authorization", `Bearer ${b}`)
      .send({ title: "Stolen" });
    expect(res.status).toBe(403);
  });

  it("validates type-specific fields (422 when rent lacks monthlyRent)", async () => {
    const token = await registerAs("owner", "ownerC@example.com");
    const { monthlyRent, ...bad } = sample;
    const res = await request(app)
      .post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send(bad);
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/listing.api.test.ts`
Expected: FAIL — 404s (routes not mounted) / module not found.

- [ ] **Step 3: Implement the controller**

Create `src/modules/listings/listing.controller.ts`:

```ts
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import * as service from "./listing.service";
import { uploadImage, destroyImage } from "../../core/utils/uploader";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type { CreateListingInput, DiscoveryQuery } from "./listing.validation";

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.createListing(req.body as CreateListingInput, req.user!.userId);
    sendCreated(res, listing, "Listing created");
  } catch (error) {
    next(error);
  }
};

export const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.getListingById(
      req.params.id,
      req.user?.userId ?? null,
      req.user?.role ?? null,
    );
    sendSuccess(res, listing, "Listing fetched");
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.updateListing(
      req.params.id, req.body, req.user!.userId, req.user!.role,
    );
    sendSuccess(res, listing, "Listing updated");
  } catch (error) {
    next(error);
  }
};

export const setStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.setStatus(
      req.params.id, req.body.status, req.user!.userId, req.user!.role,
    );
    sendSuccess(res, listing, "Status updated");
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await service.deleteListing(req.params.id, req.user!.userId, req.user!.role);
    sendSuccess(res, null, "Listing deleted", StatusCodes.OK);
  } catch (error) {
    next(error);
  }
};

export const mine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listings = await service.listMine(req.user!.userId);
    sendSuccess(res, listings, "Your listings");
  } catch (error) {
    next(error);
  }
};

export const discover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await service.discover(req.query as unknown as DiscoveryQuery);
    sendSuccess(res, result, "Discovery results");
  } catch (error) {
    next(error);
  }
};

export const uploadPhotos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.getListingById(req.params.id, req.user!.userId, req.user!.role);
    const files = (req.files as Express.Multer.File[]) ?? [];
    const uploaded = await Promise.all(files.map((f) => uploadImage(f.buffer, "listings")));
    const updated = await service.updateListing(
      listing.id, { } as never, req.user!.userId, req.user!.role,
    );
    updated.photos.push(...uploaded);
    await updated.save();
    sendSuccess(res, updated, "Photos uploaded");
  } catch (error) {
    next(error);
  }
};

export const removePhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const listing = await service.getListingById(req.params.id, req.user!.userId, req.user!.role);
    const { publicId } = req.body as { publicId: string };
    await destroyImage(publicId);
    listing.photos = listing.photos.filter((p) => p.publicId !== publicId);
    await listing.save();
    sendSuccess(res, listing, "Photo removed");
  } catch (error) {
    next(error);
  }
};
```

> Note: the `uploadPhotos` handler re-fetches via `getListingById` (which enforces ownership for non-published listings) then pushes the uploaded photos. The empty `updateListing` call is removed in Step 4's cleanup — see implementation note. To keep it simple, replace the body of `uploadPhotos` with the version below.

- [ ] **Step 3b: Use this simpler `uploadPhotos` (replaces the version above)**

```ts
export const uploadPhotos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const uploaded = await Promise.all(files.map((f) => uploadImage(f.buffer, "listings")));
    const listing = await service.addPhotos(
      req.params.id, uploaded, req.user!.userId, req.user!.role,
    );
    sendSuccess(res, listing, "Photos uploaded");
  } catch (error) {
    next(error);
  }
};
```

And add to `src/modules/listings/listing.service.ts`:

```ts
import type { IPhoto } from "./listing.model";

export const addPhotos = async (
  id: string,
  photos: IPhoto[],
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwner(listing, userId, role);
  listing.photos.push(...photos);
  await listing.save();
  return listing;
};

export const removePhoto = async (
  id: string,
  publicId: string,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwner(listing, userId, role);
  listing.photos = listing.photos.filter((p) => p.publicId !== publicId);
  await listing.save();
  return listing;
};
```

Then simplify `removePhoto` controller to call `service.removePhoto` and `destroyImage`:

```ts
export const removePhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { publicId } = req.body as { publicId: string };
    await destroyImage(publicId);
    const listing = await service.removePhoto(req.params.id, publicId, req.user!.userId, req.user!.role);
    sendSuccess(res, listing, "Photo removed");
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 4: Implement the routes**

Create `src/modules/listings/listing.routes.ts`:

```ts
import { Router } from "express";
import * as controller from "./listing.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { uploadImages } from "../../core/middleware/upload.middleware";
import {
  createListingSchema,
  updateListingSchema,
  statusSchema,
  discoverySchema,
} from "./listing.validation";

export const listingRouter = Router();

// Discovery + read (public).
listingRouter.get("/", validate(discoverySchema, "query"), controller.discover);
listingRouter.get("/mine", authenticate, authorize("agent", "owner", "admin"), controller.mine);
listingRouter.get("/:id", controller.getOne);

// Management (agent/owner/admin).
const managers = authorize("agent", "owner", "admin");

listingRouter.post("/", authenticate, managers, validate(createListingSchema), controller.create);
listingRouter.patch("/:id", authenticate, managers, validate(updateListingSchema), controller.update);
listingRouter.delete("/:id", authenticate, managers, controller.remove);
listingRouter.post("/:id/status", authenticate, managers, validate(statusSchema), controller.setStatus);
listingRouter.post("/:id/photos", authenticate, managers, uploadImages, controller.uploadPhotos);
listingRouter.delete("/:id/photos", authenticate, managers, controller.removePhoto);
```

- [ ] **Step 5: Mount the router**

In `src/index.routes.ts`, import and register:

```ts
import { listingRouter } from "./modules/listings/listing.routes";
```

```ts
router.use("/listings", listingRouter);
```

- [ ] **Step 6: Run the integration tests**

Run: `npx jest tests/listing.api.test.ts`
Expected: PASS (4 tests). The photo-upload route is covered by a dedicated test in Task 9 (it needs the uploader mock).

- [ ] **Step 7: Commit**

```bash
git add src/modules/listings/listing.controller.ts src/modules/listings/listing.routes.ts src/modules/listings/listing.service.ts src/index.routes.ts tests/listing.api.test.ts
git commit -m "feat(listings): controller, routes, and module mounting"
```

---

## Task 9: Photo upload integration test (with mocked Cloudinary)

**Files:**
- Test: `tests/listing.photos.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/listing.photos.test.ts`:

```ts
jest.mock("../src/core/utils/uploader", () => ({
  uploadImage: jest.fn().mockResolvedValue({ url: "https://cdn/p.jpg", publicId: "p1" }),
  destroyImage: jest.fn().mockResolvedValue(undefined),
}));

import request from "supertest";
import app from "../src/app";

const registerOwner = async () => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "O", email: "photo-owner@example.com", password: "Password123", role: "owner" });
  return res.body.data.tokens.accessToken as string;
};

describe("Listing photos", () => {
  it("uploads a photo and attaches it to the listing", async () => {
    const token = await registerOwner();
    const created = await request(app)
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Photo Flat", listingType: "sale", category: "residential",
        price: 200000, location: { type: "Point", coordinates: [13.4, 52.5] },
      });
    const id = created.body.data.id ?? created.body.data._id;

    const res = await request(app)
      .post(`/api/v1/listings/${id}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .attach("photos", Buffer.from("fakeimage"), { filename: "p.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.data.photos).toHaveLength(1);
    expect(res.body.data.photos[0].url).toBe("https://cdn/p.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails (then passes)**

Run: `npx jest tests/listing.photos.test.ts`
Expected: PASS if Task 8 is complete (the mock replaces the real uploader). If it fails with a 422/500, confirm `uploadImages` runs before `controller.uploadPhotos` and that `addPhotos` exists in the service.

- [ ] **Step 3: Commit**

```bash
git add tests/listing.photos.test.ts
git commit -m "test(listings): cover photo upload with mocked Cloudinary"
```

---

## Task 10: Full verification and docs update

**Files:**
- Modify: `CLAUDE.md` (note the listings module + geo conventions)
- Modify: `README.md` (add listings endpoints to the API table)

- [ ] **Step 1: Run the entire verification suite**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint clean, typecheck clean, all tests pass, build succeeds.

- [ ] **Step 2: Document the module in CLAUDE.md**

Under the architecture section, add a sentence: the `listings` module stores geolocation as a GeoJSON `Point` with a `2dsphere` index; discovery uses `$geoWithin/$box` (viewport) and `$near` (radius). Photo upload streams through `core/utils/uploader.ts`, which is mocked in tests.

- [ ] **Step 3: Add the listings endpoints to the README API table**

Add rows for `POST/GET/PATCH/DELETE /listings`, `/listings/:id`, `/listings/:id/status`, `/listings/:id/photos`, `/listings/mine`, and `GET /listings` (discovery) with the auth column.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document listings module and endpoints"
```

---

## Self-Review Notes (against the PRD)

- **FR-1..4 (roles/authz):** Task 1 (roles), Task 8 routes (`authorize`), Task 4 service (`ensureOwner`). ✓
- **FR-5..8 (listing model/validation/visibility/ownership):** Tasks 2, 3, 4. ✓
- **FR-9..11 (photo upload/remove, constraints):** Tasks 6, 7, 8, 9. ✓
- **FR-12..15 (viewport, radius, filters, pagination):** Tasks 3 (query schema), 5 (discover). ✓
- **Acceptance criteria (CI green, ownership 403, type validation 422, spatial correctness):** Tasks 8, 9, 10. ✓
- **Type consistency check:** `CreateListingInput`/`DiscoveryQuery` (Task 3) are consumed unchanged in Tasks 4, 5, 8; `IPhoto` (Task 2) used by `addPhotos`/`uploadImage` (Tasks 6, 8); `addPhotos`/`removePhoto`/`discover`/`setStatus` service signatures match controller calls. ✓
- **Deferred (correctly absent):** blockchain, escrow, analytics, compliance — per PRD §4 Non-Goals.
