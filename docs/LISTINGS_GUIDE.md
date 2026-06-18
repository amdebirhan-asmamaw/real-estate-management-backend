# Listings & Discovery — Frontend Integration Guide

> Companion to `FRONTEND_GUIDE.md`. Covers everything listing-related: CRUD, review workflow, photos, documents, map search, filtering, favorites, inquiries, offers, rental applications, saved searches, and analytics.

---

## 1. The Listing Object

Key fields returned by the API:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique listing identifier |
| `title` | `string` | Max 200 chars |
| `description` | `string` | Max 5000 chars |
| `listingType` | `"sale" \| "rent"` | Determines price field |
| `category` | `"residential" \| "commercial"` | — |
| `propertyType` | `string` | See enum below |
| `status` | `string` | Review state machine status |
| `price` | `number` | Present when `listingType=sale` |
| `monthlyRent` | `number` | Present when `listingType=rent` |
| `currency` | `string` | 3-letter ISO code (default `USD`) |
| `bedrooms` | `number` | — |
| `bathrooms` | `number` | — |
| `area` | `{ value, unit }` | `unit`: `"sqm"` or `"sqft"` |
| `yearBuilt` | `number` | 1800–2100 |
| `floorNumber` | `number` | — |
| `parkingSpaces` | `number` | — |
| `totalFloors` | `number` | — |
| `maintenanceFee` | `number` | — |
| `serviceCharge` | `number` | — |
| `furnishingStatus` | `string` | `"furnished" \| "semi_furnished" \| "unfurnished"` |
| `nearbyLandmarks` | `string[]` | — |
| `availabilityStatus` | `string` | `"available" \| "under_offer" \| "rented" \| "sold"` |
| `address` | `object` | `{ street, city, region, country, postalCode }` |
| `location` | `GeoJSON Point` | `{ type: "Point", coordinates: [lng, lat] }` |
| `amenities` | `string[]` | Free-form amenity tags |
| `photos` | `array` | `[{ url, publicId, isCover }]` |
| `verificationStatus` | `string` | `"unverified" \| "pending" \| "verified" \| "rejected" \| "suspended"` |
| `tokenId` | `string?` | Set after on-chain title mint |
| `createdBy` | `string` | Owner user ID |
| `createdAt` / `updatedAt` | `ISO date` | Timestamps |

> **Note:** Private ownership `documents` are **never** included in listing JSON. Access them via dedicated endpoints.

### Property types

```
apartment | house | villa | condominium | land |
commercial_space | office | warehouse | shop | mixed_use
```

---

## 2. Listing Lifecycle (State Machine)

### Status flow

```
draft ──submit──▶ submitted ──start_review──▶ under_review ──approve──▶ approved ──publish──▶ published
  ▲                   │                            │                                            │
  └──request_info─────┴──────request_info──────────┘                                     suspend│
                                                    └──reject──▶ rejected ──submit──▶ …    ◀───┘ unsuspend
```

Additional transitions from `published`:
- `mark_rented` → `rented` (syncs `availabilityStatus`)
- `mark_sold` → `sold` (syncs `availabilityStatus`)
- `unmark_rented` / `unmark_sold` → back to `published`
- `archive` → `archived` (from any non-archived state)

### Transition endpoint

```
POST /listings/:id/transition
```

```ts
await api(`/listings/${id}/transition`, {
  method: "POST",
  body: JSON.stringify({ action: "submit" }),
});
```

### Transition rules

| Action | Who | From | Required fields |
|---|---|---|---|
| `submit` | owner | `draft`, `rejected` | Owner must be KYC `verified` + account `active` |
| `start_review` | admin | `submitted` | — |
| `request_info` | admin | `submitted`, `under_review` | `note` (required) |
| `approve` | admin | `under_review` | — |
| `reject` | admin | `under_review` | `reason` (required enum) |
| `publish` | admin | `approved` | Requires `verificationStatus=verified` + approved `title_deed` |
| `suspend` | admin | `published` | `note` (required) |
| `unsuspend` | admin | `suspended` | — |
| `mark_rented` | owner/admin | `published` | — |
| `mark_sold` | owner/admin | `published` | — |
| `unmark_rented` | owner/admin | `rented` | — |
| `unmark_sold` | owner/admin | `sold` | — |
| `archive` | owner/admin | any (except `archived`) | — |

### Rejection reason codes

```
missing_document | invalid_ownership_proof | wrong_location |
poor_quality | suspicious | duplicate | other
```

### Rejection example

```ts
await api(`/listings/${id}/transition`, {
  method: "POST",
  body: JSON.stringify({
    action: "reject",
    reason: "missing_document",
    note: "Please upload the title deed.",
  }),
});
```

### Publish pre-conditions (returns `409` if unmet)

1. `verificationStatus === "verified"`
2. At least one ownership document of type `title_deed` with `status === "approved"`
3. `ownershipDocumentHash` is set (auto-set when title deed is approved)

### Frontend guidance

- Show only **legal actions** for the current status. Use the transition table above.
- Gate "Submit for review" on `accountStatus === "active"` and `kycStatus === "verified"`.
- After admin actions (`reject`, `request_info`, `suspend`), the owner receives a notification.

---

## 3. Listing CRUD

### Create (draft)

```ts
await api("/listings", {
  method: "POST",
  body: JSON.stringify({
    title: "Modern 3BR Apartment",
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    monthlyRent: 1500,
    currency: "USD",
    bedrooms: 3,
    bathrooms: 2,
    area: { value: 120, unit: "sqm" },
    furnishingStatus: "furnished",
    amenities: ["parking", "gym", "pool"],
    address: {
      street: "123 Main St",
      city: "Addis Ababa",
      region: "Addis Ababa",
      country: "Ethiopia",
    },
    location: { type: "Point", coordinates: [38.7578, 8.9806] }, // [lng, lat]
  }),
});
```

**Validation rules:**
- `price` is **required** when `listingType=sale`; **forbidden** when `rent`
- `monthlyRent` is **required** when `listingType=rent`; **forbidden** when `sale`
- `location` is always required — coordinates are `[longitude, latitude]`
- Sending the wrong price field returns `422`

### Read single listing

```ts
const listing = await api(`/listings/${id}`);
```

- Published listings: visible to everyone (no auth needed, uses `optionalAuthenticate`)
- Non-published: only visible to the owner or admins; others get `404`
- Viewing a published listing auto-tracks an analytics `view` event

### Update (PATCH)

```ts
await api(`/listings/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ title: "Updated Title", bedrooms: 4 }),
});
```

- Owners can only edit while status is `draft` or `rejected`
- Admins can edit in any status
- At least one field is required (`422` otherwise)

### Delete

```ts
await api(`/listings/${id}`, { method: "DELETE" });
```

### List own listings

```ts
const listings = await api("/listings/mine");
// Returns all statuses, sorted by createdAt desc
```

---

## 4. Photos

### Upload photos

```ts
const form = new FormData();
photoFiles.forEach((f) => form.append("photos", f));
await fetch(`/api/v1/listings/${id}/photos`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

- Max 10 files per request
- Images only
- Max 5 MB per file (expect `413` for oversized)

### Remove a photo

```ts
await api(`/listings/${id}/photos`, {
  method: "DELETE",
  body: JSON.stringify({ publicId: "listings/abc123/photos/img1" }),
});
```

### Reorder photos

```ts
await api(`/listings/${id}/photos/reorder`, {
  method: "PATCH",
  body: JSON.stringify({
    order: ["publicId_3", "publicId_1", "publicId_2"], // desired order
  }),
});
```

Photos not in the `order` array are appended at the end.

### Set cover photo

```ts
await api(`/listings/${id}/photos/cover`, {
  method: "PATCH",
  body: JSON.stringify({ publicId: "listings/abc123/photos/img1" }),
});
```

The `isCover` flag is set to `true` on the target photo; all others are set to `false`.

---

## 5. Ownership Documents (Private)

Documents drive the **verification** flow. They are never exposed in the listing JSON.

### Upload documents

```ts
const form = new FormData();
form.append("type", "title_deed"); // or: tax_record, utility_bill, ownership_certificate, lease_authority, government_document, other
files.forEach((f) => form.append("documents", f));
await fetch(`/api/v1/listings/${id}/documents`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

- Uploading sets listing `verificationStatus` to `"pending"`
- Images or PDF allowed; max 5 MB

### List document metadata

```ts
const docs = await api(`/listings/${id}/documents`);
// [{ id, type, status, hash, reviewNote?, uploadedAt }]
```

> `publicId` is intentionally omitted from responses. Only `hash` (SHA-256) is exposed.

### Get signed URL (view a document)

```ts
const { url } = await api(`/listings/${id}/documents/${docId}/url`);
// Short-lived signed URL for private viewing
```

### Admin: review a document

```ts
await api(`/listings/${id}/documents/${docId}/review`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve", note: "Verified." }),
});
```

- `decision`: `"approve"` or `"reject"`
- Approving a `title_deed` sets `verificationStatus=verified` and captures the `ownershipDocumentHash`
- Rejecting any document sets `verificationStatus=rejected`
- Owner is notified of the review outcome

### Document status flow

```
pending ──approve──▶ approved
         ──reject──▶ rejected
```

### Verification status values

```
unverified → pending (on upload) → verified (title_deed approved) | rejected
                                    → requires_more_info | suspended (admin actions)
```

---

## 6. Discovery — Public Search & Map Integration

`GET /listings` returns **published** listings only, with pagination.

### Three spatial modes (mutually exclusive — combining returns `400`)

#### Mode 1: Viewport (map bounding box)

```ts
const qs = new URLSearchParams({
  swLng: "38.6", swLat: "8.9",
  neLng: "38.9", neLat: "9.1",
});
const { items, total, page, limit } = await api(`/listings?${qs}`);
```

All four params (`swLng`, `swLat`, `neLng`, `neLat`) must be provided together.

#### Mode 2: Radius (point + distance)

```ts
const qs = new URLSearchParams({
  lng: "38.7578", lat: "8.9806",
  radius: "5000", // meters
});
const { items, total } = await api(`/listings?${qs}`);
```

All three params (`lng`, `lat`, `radius`) must be provided together.

#### Mode 3: Custom polygon

```ts
const polygon = JSON.stringify([
  [38.7, 8.95], [38.8, 8.95], [38.8, 9.0], [38.7, 9.0], [38.7, 8.95]
]);
const qs = new URLSearchParams({ polygon });
const { items } = await api(`/listings?${qs}`);
```

- Minimum 4 coordinate pairs
- First and last point should be the same to close the polygon
- Sent as a JSON-stringified array in the query string

### Attribute filters

All filters are optional and combine with AND logic:

| Parameter | Type | Description |
|---|---|---|
| `q` | `string` | Full-text search on `title` + `description` |
| `listingType` | `"sale" \| "rent"` | — |
| `category` | `"residential" \| "commercial"` | — |
| `propertyType` | `string` | Any valid property type enum |
| `minPrice` / `maxPrice` | `number` | Applies to both `price` and `monthlyRent` |
| `minBedrooms` | `number` | — |
| `minBathrooms` | `number` | — |
| `minArea` / `maxArea` | `number` | Filters on `area.value` |
| `verifiedOnly` | `boolean` | Only `verificationStatus=verified` |
| `availabilityStatus` | `string` | `"available" \| "under_offer" \| "rented" \| "sold"` |
| `amenities` | `string \| string[]` | Must contain ALL listed amenities |

### Sorting

| Value | Description |
|---|---|
| `newest` | Default — `createdAt` descending |
| `oldest` | `createdAt` ascending |
| `price_asc` | Price ascending |
| `price_desc` | Price descending |

### Pagination

| Parameter | Default | Max |
|---|---|---|
| `page` | `1` | — |
| `limit` | `20` | `100` |

Response shape:

```json
{ "items": [...], "total": 42, "page": 1, "limit": 20 }
```

### Full discovery example

```ts
const qs = new URLSearchParams({
  swLng: "38.6", swLat: "8.9", neLng: "38.9", neLat: "9.1",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  minBedrooms: "2",
  maxPrice: "3000",
  amenities: "parking",
  verifiedOnly: "true",
  sort: "price_asc",
  page: "1",
  limit: "20",
});
const result = await api(`/listings?${qs}`);
```

### Map integration tips

1. **On map move/zoom:** debounce → extract viewport bounds → call with `swLng/swLat/neLng/neLat`
2. **Coordinates are always `[longitude, latitude]`** (GeoJSON standard)
3. **Markers:** use `listing.location.coordinates` for pin placement
4. **Cluster pins** client-side when `total` exceeds display threshold
5. **"Search this area" button:** re-query with current map bounds
6. **Polygon draw tool:** serialize drawn shape as `[[lng,lat],...]` and send as `polygon` param

---

## 7. Favorites

Any authenticated user can manage favorites. Idempotent operations.

```ts
// Save a listing
await api("/favorites", {
  method: "POST",
  body: JSON.stringify({ listingId }),
});

// List saved listings
const favorites = await api("/favorites"); // returns listing objects

// Remove
await api(`/favorites/${listingId}`, { method: "DELETE" });
```

- Can only favorite listings visible to the user (published or own)
- Saving twice is a no-op
- Removing a non-favorited listing is also a no-op
- Tracks a `favorite` analytics event

---

## 8. Inquiries

Lightweight Q&A between any user and a listing owner.

### Send an inquiry

```ts
await api("/inquiries", {
  method: "POST",
  body: JSON.stringify({
    listingId: "64abc...",
    message: "Is this still available?",
    inquiryType: "rent", // "rent" | "buy" | "general" (default: "general")
    contactInfo: { phone: "+251911000000", email: "me@example.com" }, // optional
  }),
});
```

### List inquiries

```ts
// What I sent
const sent = await api("/inquiries/mine");

// What I received (listing owner)
const received = await api("/inquiries/received");
```

### Respond to / update an inquiry (owner or admin)

```ts
await api(`/inquiries/${id}`, {
  method: "PATCH",
  body: JSON.stringify({
    response: "Yes, it's available! Would you like to schedule a visit?",
    status: "responded", // "open" | "responded" | "in_discussion" | "closed" | "spam"
  }),
});
```

### Admin: list all inquiries

```ts
const qs = new URLSearchParams({ status: "open", page: "1", limit: "20" });
const result = await api(`/inquiries/admin?${qs}`);
// { items, total, page, limit }
```

Optional filters: `status`, `listingId`.

---

## 9. Offers (Sale Listings Only)

Purchase price negotiation for `listingType=sale`.

### Submit an offer (tenant/buyer role)

```ts
await api("/offers", {
  method: "POST",
  body: JSON.stringify({
    listingId: "64abc...",
    amount: 250000,
    currency: "USD",
    message: "Offering below asking, cash ready.", // optional
    expiresAt: "2026-07-01T00:00:00Z",             // optional
  }),
});
```

- Only works on `sale` listings that are `published`
- Cannot offer on your own listing (returns `409`)
- Triggers compliance `flagOfferIfHighRisk` check

### List offers

```ts
const myOffers = await api("/offers/mine");       // offers I made
const received = await api("/offers/received");   // offers on my listings
```

### Respond to an offer (owner or admin)

```ts
await api(`/offers/${id}/respond`, {
  method: "PATCH",
  body: JSON.stringify({
    action: "counter",         // "accept" | "reject" | "counter"
    counterAmount: 270000,     // required when action=counter
    responseNote: "Can we meet at 270K?",
  }),
});
```

- **Accept** → auto-creates a `PurchaseTransaction`
- **Counter** → requires `counterAmount`
- Can only respond to offers in `submitted` or `countered` status

### Cancel an offer (buyer only)

```ts
await api(`/offers/${id}/cancel`, { method: "POST" });
```

### Offer status flow

```
submitted ──accept──▶ accepted (→ creates PurchaseTransaction)
           ──reject──▶ rejected
           ──counter──▶ countered ──accept/reject/counter──▶ ...
           ──cancel──▶ cancelled (buyer only)
```

---

## 10. Rental Applications (Rent Listings Only)

Full tenant vetting pipeline for `listingType=rent`.

### Apply (tenant role only)

```ts
await api("/rental-applications", {
  method: "POST",
  body: JSON.stringify({
    listingId: "64abc...",
    desiredStartDate: "2026-08-01",
    desiredEndDate: "2027-07-31",
    occupants: 2,
    monthlyIncome: 5000,
    employer: "Acme Corp",
    message: "Reliable tenant, no pets.",
  }),
});
```

- Only works on `rent` listings
- One active application per listing per tenant (duplicate returns `409`)
- Cannot apply to own listing

### List applications

```ts
const apps = await api("/rental-applications/mine");
// Tenants see their own; landlords see received; admins see all
```

### Get single application

```ts
const app = await api(`/rental-applications/${id}`);
// Visible to tenant, landlord, or admin
```

### Review (landlord/admin)

```ts
await api(`/rental-applications/${id}/review`, {
  method: "PATCH",
  body: JSON.stringify({ status: "approved", note: "Looks great." }),
  // status: "screening" | "approved" | "rejected"
});
```

### Update screening (landlord/admin)

```ts
await api(`/rental-applications/${id}/screening`, {
  method: "PATCH",
  body: JSON.stringify({
    status: "passed",       // "pending" | "passed" | "failed" | "manual_review"
    provider: "CheckrAPI",
    reference: "CHK-12345",
    score: 750,
    notes: "Clean background.",
  }),
});
```

Setting `status=pending` auto-transitions the application to `screening`.

### Manage viewing appointment

```ts
// Tenant requests
await api(`/rental-applications/${id}/appointment`, {
  method: "PATCH",
  body: JSON.stringify({ status: "requested" }),
});

// Landlord schedules
await api(`/rental-applications/${id}/appointment`, {
  method: "PATCH",
  body: JSON.stringify({
    status: "scheduled",
    scheduledFor: "2026-07-10T14:00:00Z",
    locationNote: "Meet at lobby",
  }),
});
```

Tenants may only set `status` to `requested` or `cancelled`.

### Create lease from approved application (landlord/admin)

```ts
await api(`/rental-applications/${id}/lease`, {
  method: "POST",
  body: JSON.stringify({
    monthlyRent: 1500,
    depositAmount: 3000,
    currency: "USD",
    startDate: "2026-08-01",
    endDate: "2027-07-31",
    terms: "Standard 12-month lease...",
  }),
});
```

- Application must be `approved`
- Creates a `Lease` document and sets application status to `lease_created`

### Withdraw (tenant only)

```ts
await api(`/rental-applications/${id}/withdraw`, { method: "POST" });
```

Cannot withdraw once `lease_created`.

### Application status flow

```
submitted ──review──▶ screening ──review──▶ approved ──create lease──▶ lease_created
                                            rejected
           ──withdraw──▶ withdrawn (any status except lease_created)
```

---

## 11. Saved Searches & Alerts

Users can save discovery queries and opt into notifications when new matching listings are published.

### Save a search

```ts
await api("/saved-searches", {
  method: "POST",
  body: JSON.stringify({
    name: "2BR apartments in Bole",
    query: {
      swLng: 38.74, swLat: 8.98, neLng: 38.80, neLat: 9.02,
      listingType: "rent",
      propertyType: "apartment",
      minBedrooms: 2,
      maxPrice: 2000,
    },
    alertEnabled: true, // receive notifications on new matches
  }),
});
```

### List saved searches

```ts
const searches = await api("/saved-searches");
```

### Update

```ts
await api(`/saved-searches/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ alertEnabled: false }),
});
```

### Delete

```ts
await api(`/saved-searches/${id}`, { method: "DELETE" });
```

### How alerts work

When a listing transitions to `published`, the system evaluates all saved searches with `alertEnabled=true`. Matching searches trigger a `saved_search.match` notification to the search owner.

Matching checks: `listingType`, `category`, `propertyType`, `minBedrooms`, `minBathrooms`, `minPrice`/`maxPrice`, and all three spatial modes (viewport, radius, polygon).

---

## 12. Listing Analytics

Property owners and admins can view engagement metrics per listing.

### Per-listing analytics

```ts
const stats = await api(`/listings/${id}/analytics`);
```

Response:

```json
{
  "listingId": "64abc...",
  "counts": {
    "view": 150,
    "favorite": 12,
    "inquiry": 5,
    "offer": 2,
    "rental_application": 3
  },
  "uniqueViewers": 98,
  "leadCount": 10,
  "conversionRate": 0.066,
  "lastEventAt": "2026-06-15T10:00:00Z"
}
```

- `leadCount` = inquiries + offers + rental applications
- `conversionRate` = leadCount / views

### Owner dashboard

```ts
const dashboard = await api("/listings/dashboard");
```

Response:

```json
{
  "total": 5,
  "byStatus": { "published": 3, "draft": 1, "under_review": 1 },
  "pendingInquiries": 4,
  "analytics": {
    "counts": { "view": 500, "favorite": 30, "inquiry": 15, "offer": 5, "rental_application": 8 },
    "leadCount": 28
  }
}
```

---

## 13. Admin Surfaces

### Review queue

```ts
const qs = new URLSearchParams({ status: "submitted", page: "1", limit: "20" });
const queue = await api(`/admin/listings?${qs}`);
```

Filters: `status`, `verificationStatus`, `propertyType`, `page`, `limit`.

### Admin dashboard stats

```ts
const stats = await api("/admin/listings/stats");
```

```json
{
  "total": 120,
  "byStatus": { "published": 80, "draft": 15, "submitted": 10, "under_review": 5, "...": "..." },
  "byVerification": { "verified": 70, "unverified": 30, "pending": 10, "...": "..." },
  "pendingReview": 15
}
```

### Duplicate detection (during review)

```ts
const dupes = await api(`/listings/${id}/duplicates`);
// [{ id, title, status, reasons: ["same_owner", "nearby_similar"] }]
```

Non-blocking hints. Flags: `same_owner` (same createdBy), `nearby_similar` (within 50m with matching title or postcode).

---

## 14. On-Chain Title Verification

### Mint a title (admin only)

```ts
await api(`/listings/${id}/mint-title`, { method: "POST" });
```

Pre-conditions: `verificationStatus=verified`, `ownershipDocumentHash` set, no existing `tokenId`.

### Read title info (public)

```ts
const title = await api(`/listings/${id}/title`);
```

```json
{
  "tokenId": "42",
  "contractAddress": "0xabc...",
  "owner": "0xdef...",
  "status": "active",
  "onChainHash": "sha256...",
  "offChainHash": "sha256...",
  "verified": true
}
```

Show a "Verified on-chain ✓" badge when `verified === true`. `404` = no title minted; `503` = chain not configured.

### Dispute / clear / revoke (admin only)

```ts
// Dispute — suspends listing
await api(`/listings/${id}/title/dispute`, {
  method: "POST",
  body: JSON.stringify({ reason: "Ownership contested by third party" }),
});

// Clear dispute — restores to published
await api(`/listings/${id}/title/clear-dispute`, {
  method: "POST",
  body: JSON.stringify({ reason: "Dispute resolved, ownership confirmed" }),
});

// Revoke — permanently archives listing
await api(`/listings/${id}/title/revoke`, {
  method: "POST",
  body: JSON.stringify({ reason: "Fraudulent documentation" }),
});
```

---

## 15. Error Reference (Listing-Specific)

| Status | Scenario | Frontend action |
|---|---|---|
| `400` | Multiple spatial modes combined | Fix the request — use only one |
| `403` | Owner account not `active`, KYC not `verified`, wrong role | Show permission message / redirect to KYC |
| `404` | Listing not found (or unpublished and not owner) | Show not-found UI |
| `409` | Illegal transition, publish before verified, offer on own listing, duplicate rental application | Show `message` from response |
| `413` | File too large | Show "max 5 MB" message |
| `422` | Wrong price field for listing type, missing required fields | Map `errors[].field` to form inputs |
| `503` | Cloudinary or blockchain not configured | Feature unavailable banner |

---

## 16. Recommended Frontend Patterns

1. **Map + list split view:** Use viewport mode for map-driven discovery; re-query on pan/zoom with debounce.
2. **Status badge component:** Color-code listing `status` and `verificationStatus` consistently.
3. **Action buttons from state machine:** Only render legal transitions for current status + user role.
4. **Optimistic favorites:** Toggle heart icon immediately, roll back on error.
5. **Saved search as "notification subscription":** Let users toggle `alertEnabled` from their search history.
6. **Analytics dashboard cards:** Display `conversionRate` as percentage, show sparkline of views over time.
7. **Document review queue (admin):** List documents with `status=pending`, show signed URL preview, approve/reject inline.
