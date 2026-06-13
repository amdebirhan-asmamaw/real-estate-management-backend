# PRD — Increment 1: Marketplace Core with Verified Review (Backend)

**Product:** Decentralized Real Estate Platform
**Increment:** 1 of N (Agile / incremental delivery)
**Scope:** Backend API only, on the Express + TypeScript + MongoDB template. Blockchain (smart contracts, title minting, escrow) and the web frontend are **out of scope** here (see roadmap §10).
**Status:** Implemented ✅

---

## 1. Background & Vision

The platform's long-term vision is a decentralized real-estate marketplace where ownership, titles, and rental agreements are verifiable on-chain, intermediaries are reduced, and discovery is spatial and data-rich. We deliver incrementally: a **verified** off-chain marketplace first, then anchor it on-chain.

Increment 1 delivers the marketplace core with an **integrity guarantee**: property owners publish nothing directly — listings become public only after an administrator reviews the owner's private ownership documents and approves them. This produces the trustworthy off-chain "source of truth" later increments anchor to the blockchain.

## 2. Problem Statement

Seekers cannot efficiently find listings matching both spatial constraints (neighborhood, near-a-point) and attributes (price, type, size). Owners need a structured, multi-role system to manage listings. Critically, an unverified marketplace cannot be trusted: ownership must be vetted before a listing is publicly discoverable.

## 3. Roles

| Role | Jobs To Be Done |
| --- | --- |
| **tenant** (public) | Discover/filter published listings; view detail + photos. |
| **property_owner** | Create/edit own draft listings; upload photos + private ownership docs; submit for review. |
| **admin** | Review documents, verify ownership, approve/reject/publish/suspend; view audit log + duplicate warnings. |
| **super_admin** | Same as admin in Increment 1 (distinction — managing admins — reserved for later). |

Self-registration is limited to `property_owner` and `tenant`; `admin`/`super_admin` are provisioned out-of-band. Default role: `tenant`.

## 4. Goals & Non-Goals

**Goals**
- Role-based auth across the four roles.
- Listing lifecycle through an **admin-gated review workflow** (owners cannot self-publish).
- Both for-sale and for-rent listings (metadata only).
- Public photo galleries (Cloudinary).
- **Private ownership-document upload**, admin review, and sha-256 hashing (prep for on-chain).
- Geospatial discovery: viewport + radius + attribute filters + pagination (published-only).
- Queryable audit log; non-blocking duplicate-listing warnings for admins.
- Blockchain-ready metadata fields present on the model.

**Non-Goals**
- **Increment 1.5 (deferred):** favorites/saved properties; tenant→owner inquiries.
- **Increment 2+:** all on-chain logic (title minting, escrow, document-hash anchoring), rental-agreement execution, analytics dashboards, AML/compliance vetting.

## 5. Functional Requirements

### 5.1 Auth & Roles
- FR-1: Register as `property_owner` or `tenant` (default `tenant`); `admin`/`super_admin` rejected at registration.
- FR-2: Reuses the template's JWT access/refresh auth.
- FR-3: Listing management requires `property_owner` (own) or admin.
- FR-4: A user may modify/delete only their own listing; admins may act on any.

### 5.2 Listings & Review Workflow
- FR-5: Captures title, description, listingType (`sale|rent`), category (`residential|commercial`), price/monthlyRent + currency, bedrooms, bathrooms, area, address, GeoJSON location, amenities, photos.
- FR-6: Validation rejects out-of-range coordinates, negatives, and missing type-specific fields (`monthlyRent` for rent, `price` for sale).
- FR-7: **Statuses:** `draft → submitted → under_review → approved → published`, plus `rejected`, `suspended`, `archived`. Owners create drafts and `submit`; **only admins** `start_review`/`approve`/`reject`/`publish`/`suspend`. Illegal transitions return 409; wrong-role transitions 403.
- FR-8: Rejection requires a reason code: `missing_document`, `invalid_ownership_proof`, `wrong_location`, `poor_quality`, `suspicious`, `duplicate`, `other`. "Request info" returns the listing to `draft` with a note.
- FR-9: Owners can edit content only while `draft` or `rejected`; admins anytime.
- FR-10: Only `published` listings are publicly visible/discoverable; owners see their own (any status); admins see all.

### 5.3 Photos (public) & Ownership Documents (private)
- FR-11: Owners upload public photos to a listing's gallery; remove by publicId. Deletion removes from the listing first, then destroys the remote asset.
- FR-12: Owners upload **private** ownership documents (image/PDF) stored as Cloudinary *authenticated* resources; each is sha-256 hashed at upload. Documents are never returned in a listing's JSON.
- FR-13: Document metadata is listable by the owner/admin (without the Cloudinary publicId); the actual file is reachable only via an authz-gated **signed URL** endpoint.
- FR-14: Admins approve/reject each document. Approving the title deed sets the listing `verificationStatus = verified`, stamps `verifiedBy`/`verifiedAt`, and copies the document hash into `ownershipDocumentHash`.

### 5.4 Discovery, Audit, Duplicates
- FR-15: Viewport (bounding-box), radius (point + meters), and attribute filters (type, category, price range, min beds/baths), paginated with total counts.
- FR-16: Every lifecycle transition and document review writes a queryable `AuditLog` entry (actor, role, action, target, timestamp).
- FR-17: Admins can fetch non-blocking duplicate warnings for a listing (same owner, or nearby + similar title/postcode).

### 5.5 Blockchain-ready (present, mostly unpopulated)
- FR-18: `Listing` carries `verificationStatus`, `verifiedBy`, `verifiedAt`, `ownershipDocumentHash`, `blockchainTxHash`, `titleCertificateId`, `contractAddress`, `tokenId`. Increment 1 populates only the verification fields; the rest are reserved for Increment 2.

## 6. API Surface (`/api/v1`)

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Register (property_owner \| tenant) |
| GET | `/listings` | public | Discovery (published only) |
| GET | `/listings/:id` | optional | Published, or own/admin |
| GET | `/listings/mine` | owner | Caller's listings (any status) |
| POST | `/listings` | owner/admin | Create draft |
| PATCH | `/listings/:id` | owner(draft/rejected)/admin | Edit |
| DELETE | `/listings/:id` | owner/admin | Delete |
| POST | `/listings/:id/transition` | owner/admin (per table) | Review state machine |
| POST · DELETE | `/listings/:id/photos` | owner/admin | Upload / remove public photos |
| POST · GET | `/listings/:id/documents` | owner/admin | Upload / list private docs |
| GET | `/listings/:id/documents/:docId/url` | owner/admin | Signed URL |
| POST | `/listings/:id/documents/:docId/review` | admin | Approve/reject a doc |
| GET | `/listings/:id/duplicates` | admin | Duplicate warnings |
| GET | `/admin/listings` | admin | Review queue (status filter) |
| GET | `/audit-logs` | admin | Query audit trail |

All responses use the `{ success, message, data }` envelope.

## 7. Acceptance Criteria (met)

- Owner can create a draft, upload private docs, and submit; only an admin can publish. ✅
- Public/anonymous clients retrieve only published listings; viewport/radius/filters return correct sets. ✅
- A user cannot modify another's listing (403); a property_owner cannot publish (403); rent without `monthlyRent` is 422. ✅
- Documents never leak a public URL; signed-URL access is role-gated; non-owners get 403. ✅
- The audit trail records the full create→submit→…→publish chain. ✅
- `lint`, `typecheck`, `test` (72 tests), and `build` pass. ✅

## 8. Technical Notes

- New `listings` + `audit` modules follow the template's routes → controller → service → model + validation pattern (documented in `CLAUDE.md`).
- Geolocation: GeoJSON `Point` + `2dsphere` index backing `$geoWithin/$box` (viewport) and `$near` (radius).
- Cloudinary: public `upload` for photos, `authenticated` for documents; uploads disabled/mocked under `NODE_ENV=test`.
- New env: `CLOUDINARY_CLOUD_NAME/_API_KEY/_API_SECRET`, `UPLOAD_MAX_BYTES` (validated in `env.ts`).

## 9. Open Items (resolved)

- CDN provider: **Cloudinary** (public photos + authenticated private docs).
- `area` unit: per-listing `sqm|sqft`, default `sqm`. Currency: per-listing ISO code, default `USD`.

## 10. Increment Roadmap

1. **Increment 1 — Marketplace Core (this PRD):** roles, listings, review workflow, photos, private documents, discovery, audit. ✅
2. **Increment 1.5:** favorites/saved properties; tenant→owner inquiries.
3. **Increment 2 — On-chain titles:** Solidity on local Hardhat; mint a digital title NFT and anchor `ownershipDocumentHash`; populate `tokenId`/`contractAddress`/`blockchainTxHash`.
4. **Increment 3 — Rental agreements & escrow.**
5. **Increment 4 — Agent/Owner analytics.**
6. **Increment 5 — Compliance & oversight** (AML, broker-license, transaction auditing — builds on the audit log).
