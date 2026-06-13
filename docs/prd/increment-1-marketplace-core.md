# PRD — Increment 1: Marketplace Core (Backend)

**Product:** Decentralized Real Estate Platform
**Increment:** 1 of N (Agile / incremental delivery)
**Scope of this document:** Backend API only, built on the existing Express + TypeScript + MongoDB template. Blockchain (smart contracts, digital titles, escrow) and the web frontend are explicitly **out of scope** for this increment and are tracked in the roadmap below.
**Status:** Draft for build

---

## 1. Background & Vision

The platform's long-term vision is a decentralized real estate marketplace where ownership, titles, and rental agreements are verifiable on-chain, intermediaries are reduced, and discovery is spatial and data-rich. Delivering that all at once is high-risk. We deliver incrementally: a usable off-chain marketplace first, then layer Web3 trust guarantees onto a proven foundation.

**Increment 1 delivers the marketplace core**: the ability for property owners and agents to publish richly-described, photo-backed listings, and for buyers/renters to discover them through map-driven spatial search and filtering. This is the off-chain "source of truth" that later increments anchor to the blockchain.

## 2. Problem Statement

Property seekers cannot efficiently find listings that match both their spatial constraints (specific neighborhoods, "what's near me / near this point") and their attribute constraints (price, type, size). Owners and agents lack a structured, multi-role system to publish and manage listings with proper ownership of their data. Existing portals also mix listing data quality and access control poorly.

Increment 1 solves the **discovery and listing-management** problem with a clean, role-aware API and true geospatial search — without yet relying on blockchain.

## 3. Target Users & Roles

| Role               | Primary Jobs To Be Done                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Buyer / Renter** | Search and filter listings by location and attributes; view full listing detail with photos.       |
| **Agent**          | Create and manage listings on behalf of clients; manage their own portfolio of listings.           |
| **Owner**          | Publish and manage listings for properties they own.                                               |
| **Admin**          | Oversee all listings; moderate/unpublish; manage users. (Compliance vetting is a later increment.) |

Agents and Owners have equivalent listing-management capabilities in Increment 1; the distinction becomes meaningful in later increments (e.g. on-chain title ownership vs. brokered representation).

## 4. Goals & Non-Goals

**Goals**

- Role-based authentication and authorization across buyer/renter, agent, owner, admin.
- Full property listing lifecycle: create, read, update, delete, publish/unpublish.
- Support both **for-sale** and **for-rent** listings (metadata only).
- Photo galleries via a real upload pipeline to a CDN.
- Geospatial discovery: map-viewport (bounding-box) search, radius-from-point search, and attribute filtering, with pagination.

**Non-Goals (deferred to later increments)**

- Any blockchain / smart-contract / digital-title / escrow functionality.
- Rental-agreement execution, payments, or escrow logic (rental fields are descriptive only).
- Lead-generation analytics, rental-yield dashboards, tenant management.
- AML/compliance vetting, broker-license verification, transaction auditing.
- The web/mobile frontend (this increment exposes the API only).

## 5. Functional Requirements

### 5.1 Authentication & Roles

- FR-1: Users register with a role of `buyer`, `agent`, or `owner`. `admin` is assigned out-of-band (seed/admin action), never via public registration.
- FR-2: Existing JWT access/refresh auth from the template is reused.
- FR-3: Listing-management endpoints require an authenticated `agent`, `owner`, or `admin`.
- FR-4: A user may only modify/delete listings they created; `admin` may modify/delete any listing.

### 5.2 Property Listings

- FR-5: A listing captures: title, description, listing type (`sale` | `rent`), property category (`residential` | `commercial`), status (`draft` | `published` | `unpublished` | `archived`), price (sale) or monthlyRent + currency (rent), bedrooms, bathrooms, area (value + unit), address (street, city, region, country, postalCode), geolocation (longitude, latitude), amenities (string list), and a photos list.
- FR-6: Validation rejects out-of-range coordinates, negative prices/areas, and missing type-specific fields (e.g. `monthlyRent` required when type is `rent`).
- FR-7: Only `published` listings are visible to buyers/renters and in discovery results. Owners/agents see their own non-published listings; admins see all.
- FR-8: Listings are owned by their creator (`createdBy`) and timestamped.

### 5.3 Photo Upload

- FR-9: Listing owners can upload one or more images for a listing; images are stored on a CDN and the returned URLs are attached to the listing's photo gallery.
- FR-10: Uploads are constrained by file type (images only) and a per-file size limit.
- FR-11: A photo can be removed from a listing's gallery.

### 5.4 Spatial Discovery

- FR-12: **Viewport search** — return published listings whose location falls within a bounding box (SW/NE corners) supplied by the map.
- FR-13: **Radius search** — return published listings within a given distance (meters/km) of a point.
- FR-14: **Attribute filters** — combinable with either spatial mode: listing type, category, price/rent range, min bedrooms, min bathrooms, status (admin/owner only).
- FR-15: Results are paginated and return total count metadata.

## 6. API Surface (high-level contract)

All responses use the template's `{ success, message, data }` envelope. Base path `/api/v1`.

| Method | Endpoint               | Auth                   | Purpose                                              |
| ------ | ---------------------- | ---------------------- | ---------------------------------------------------- |
| POST   | `/auth/register`       | —                      | Register (role: buyer/agent/owner)                   |
| POST   | `/listings`            | agent/owner/admin      | Create listing                                       |
| GET    | `/listings/:id`        | optional               | Get one listing (published, or own/admin)            |
| PATCH  | `/listings/:id`        | owner of listing/admin | Update listing                                       |
| DELETE | `/listings/:id`        | owner of listing/admin | Delete listing                                       |
| POST   | `/listings/:id/status` | owner of listing/admin | Publish/unpublish/archive                            |
| POST   | `/listings/:id/photos` | owner of listing/admin | Upload photos (multipart)                            |
| DELETE | `/listings/:id/photos` | owner of listing/admin | Remove a photo by URL/id                             |
| GET    | `/listings`            | optional               | Discovery: viewport OR radius + filters + pagination |
| GET    | `/listings/mine`       | agent/owner            | The caller's listings (any status)                   |

## 7. Success Metrics & Acceptance Criteria

**Acceptance (Increment 1 is "done" when):**

- A registered owner/agent can create a listing, upload photos, and publish it.
- A buyer (or anonymous client) can retrieve only published listings.
- Viewport search returns exactly the published listings within the supplied box and excludes those outside it.
- Radius search returns published listings ordered by/within the given distance.
- Attribute filters correctly narrow results and combine with spatial queries.
- A user cannot modify or delete another user's listing (403); an admin can.
- Type-specific validation is enforced (rent requires `monthlyRent`, sale requires `price`).
- All endpoints covered by integration tests against the in-memory MongoDB; lint, typecheck, tests, and build pass in CI.

**Product metrics (to instrument later):** listings published per active owner, search-to-detail click-through, share of searches using spatial vs. attribute-only.

## 8. Technical Considerations (high-level)

- Built as a new `listings` feature module following the template's module pattern (routes → controller → service → model + validation), documented in `CLAUDE.md`.
- Geolocation stored as GeoJSON `Point` with a MongoDB `2dsphere` index to back `$geoWithin` (viewport) and `$near`/`$geoNear` (radius) queries.
- Photo upload via multipart middleware streaming to a CDN provider; provider credentials added to the validated env config. Uploads must be disabled/mocked under `NODE_ENV=test`.
- New roles extend the existing role enum and `authorize()` middleware.

## 9. Increment Roadmap (for context — not built here)

1. **Increment 1 — Marketplace Core (this PRD):** roles, listings, photos, spatial discovery.
2. **Increment 2 — On-chain titles:** Solidity contracts on a local Hardhat node; mint a digital title NFT for a property and verify ownership; link a listing to its on-chain title.
3. **Increment 3 — Rental agreements & escrow:** smart-contract lease execution and automated escrow.
4. **Increment 4 — Agent/Owner portal analytics:** rental-yield tracking, lead analytics, tenant management.
5. **Increment 5 — Compliance & oversight:** AML vetting, broker-license verification, transaction auditing.

## 10. Open Questions

- CDN provider for photos: Cloudinary (assumed Cloudinary based on prior project artifacts — confirm at plan execution).
- Unit conventions for `area` (sqm vs sqft) — default sqm, allow per-listing unit.
- Currency handling — single default currency for the prototype, or per-listing currency code (default: per-listing ISO code).
