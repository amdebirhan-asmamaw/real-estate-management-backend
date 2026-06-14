# Frontend Developer Guide

This guide is everything a frontend developer needs to integrate with the Real Estate Marketplace API. It complements the interactive reference:

- **Swagger UI:** `GET /api/docs` (try requests in the browser)
- **OpenAPI JSON:** `GET /api/docs.json` (generate a typed client with `openapi-typescript`, `orval`, etc.)

---

## 1. Basics

- **Base URL:** `http://localhost:5000/api/v1` in dev. All endpoints below are relative to `/api/v1` (except `/health`, `/api/docs`).
- **Content type:** `application/json` for normal requests; `multipart/form-data` for uploads.
- **CORS:** configured via `CORS_ORIGIN`; credentials are allowed.

### Response envelope

Every JSON response uses the same shape.

```jsonc
// success
{ "success": true, "message": "Login successful", "data": { /* ... */ } }
// error
{ "success": false, "message": "Listing not found", "errors": [ /* optional */ ] }
```

Always branch on HTTP status first, then read `data` (success) or `message`/`errors` (failure).

### Validation errors

`422` responses include a field-level `errors` array:

```json
{
  "success": false,
  "message": "Validation error",
  "errors": [{ "field": "email", "message": "Invalid email address" }]
}
```

Map these onto form fields by `field`.

### Pagination

List endpoints that paginate return:

```json
{ "items": [ /* ... */ ], "total": 42, "page": 1, "limit": 20 }
```

### Rate limiting

`/api/*` is rate-limited (default 100 req / 15 min per IP; auth routes 10 / 15 min). On `429`, back off and surface the `message`. Standard `RateLimit-*` headers are returned.

---

## 2. Authentication

JWT with **access** + **refresh** tokens. The API is stateless today (tokens are returned in the body; store them client-side).

### Flow

1. **Register** → `POST /auth/register` → returns `{ user, tokens }`.
2. **Login** → `POST /auth/login` → returns `{ user, tokens }`.
3. Send the access token on protected calls: `Authorization: Bearer <accessToken>`.
4. When a call returns `401`, call `POST /auth/refresh-token` with the refresh token to get a new pair, then retry.
5. `GET /auth/me` returns the current profile.

> Storage: keep the access token in memory and the refresh token in a secure, httpOnly-style store where possible. (A server-side session store with rotation/logout is on the roadmap; until then treat refresh tokens carefully.)

### Register

```ts
await fetch("/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "Password1", // ≥8 chars, 1 uppercase, 1 number
    role: "property_owner", // or "tenant" (default). admin is NOT self-registerable
  }),
});
```

### Authenticated fetch helper

```ts
async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...body };
  return body.data;
}
```

---

## 3. Roles, account status & KYC

### Roles

| Role | Can do |
| --- | --- |
| `tenant` | Browse/search published listings, favorite, send inquiries |
| `property_owner` | All tenant abilities + create/manage own listings, upload docs |
| `admin` / `super_admin` | Review & publish listings, review KYC, manage users, audit |

Self-registration is limited to `property_owner` and `tenant`.

### Account status (`accountStatus`)

`pending → active`, plus `suspended`, `blocked`, `rejected`.

- **Tenants** are `active` immediately.
- **Property owners** start `pending` and must pass KYC to become `active`.
- `suspended` / `blocked` / `rejected` accounts get **403 on login** — show the returned `message`.

### KYC (`kycStatus`: `not_started → pending → verified | rejected`)

A property owner **cannot submit a listing for review until their account is `active`** (i.e. KYC `verified`). Build this into the owner onboarding UX:

1. After registration, show a "Verify your identity" step.
2. Upload KYC documents → `POST /kyc/documents` (multipart, field `documents`, plus a `type`).
3. Poll `GET /kyc/me` for `kycStatus`. While `pending`, show "Under review". On `verified`, unlock listing submission; on `rejected`, show `reviewNote` and allow re-upload.

```ts
const form = new FormData();
form.append("type", "passport");
form.append("documents", file); // can append multiple
await fetch("/api/v1/kyc/documents", {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` }, // no Content-Type — let the browser set the boundary
  body: form,
});
```

KYC documents are private — you never receive a public URL. To display one, request a short-lived signed URL: `GET /kyc/documents/:docId/url`.

---

## 4. Listings

### The listing object

Key fields: `id`, `title`, `description`, `listingType` (`sale|rent`), `category` (`residential|commercial`), `status`, `price` (sale) or `monthlyRent` (rent) + `currency`, `bedrooms`, `bathrooms`, `area {value, unit}`, `address {...}`, `location` (GeoJSON Point, `[lng, lat]`), `amenities`, `photos[]`, `verificationStatus`, `tokenId`. Private ownership documents are **never** part of this object.

### Review state machine

Owners create drafts and submit; **only admins publish**. Drive it via `POST /listings/:id/transition` with `{ action, reason?, note? }`.

```
draft ──submit──► submitted ──start_review──► under_review ──approve──► approved ──publish──► published
  ▲                   │                            │                                            │
  └──request_info─────┴──────request_info──────────┘                                     suspend │
                                                    └──reject──► rejected ──submit──► …    ◄──────┘ unsuspend
```

| Action | Who | Notes |
| --- | --- | --- |
| `submit` | owner | Owner account must be `active` |
| `start_review`, `approve`, `publish`, `suspend`, `unsuspend` | admin | — |
| `request_info` | admin | Requires `note`; sends listing back to `draft` |
| `reject` | admin | Requires `reason` (enum) |
| `archive` | owner/admin | From any non-archived state |

**Publishing requires verified ownership** — an approved `title_deed`, `verificationStatus === "verified"`, and an anchored document hash. Attempting otherwise returns `409`.

Owners can only **edit** (`PATCH /listings/:id`) while a listing is `draft` or `rejected`.

### Create

```ts
await api("/listings", {
  method: "POST",
  body: JSON.stringify({
    title: "Sunny 2BR",
    listingType: "rent",
    category: "residential",
    monthlyRent: 1200,
    currency: "EUR",
    bedrooms: 2,
    location: { type: "Point", coordinates: [13.405, 52.52] }, // [lng, lat]
  }),
});
```

- `price` is required when `listingType=sale`; `monthlyRent` when `rent` (sending the wrong one is a `422`).
- `GET /listings/mine` lists the caller's own listings in any status.

---

## 5. Discovery (public map search)

`GET /listings` returns **published** listings only, paginated. Choose one spatial mode:

- **Viewport (map bounds):** `swLng, swLat, neLng, neLat`
- **Radius:** `lng, lat, radius` (meters)

Plus filters: `listingType`, `category`, `minPrice`, `maxPrice`, `minBedrooms`, `minBathrooms`, and `page`/`limit`.

```ts
const qs = new URLSearchParams({
  swLng: "13.3", swLat: "52.4", neLng: "13.5", neLat: "52.6",
  listingType: "rent", maxPrice: "2000", page: "1", limit: "20",
});
const { items, total } = await api(`/listings?${qs}`);
```

> You cannot combine both spatial modes in one request (`400`). Coordinates are `[longitude, latitude]` everywhere.

---

## 6. Photos & ownership documents

| | Photos | Ownership documents |
| --- | --- | --- |
| Visibility | Public (URLs in listing) | Private (signed URL only) |
| Upload | `POST /listings/:id/photos` | `POST /listings/:id/documents` |
| Form field | `photos` (≤10) | `documents` (≤10) |
| Allowed types | images | images or PDF |
| Remove | `DELETE /listings/:id/photos` `{ publicId }` | — |

```ts
const form = new FormData();
photoFiles.forEach((f) => form.append("photos", f));
await fetch(`/api/v1/listings/${id}/photos`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

Ownership documents drive verification. Owner uploads (`type: title_deed | tax_record | utility_bill | ownership_certificate | other`), then an admin approves the `title_deed`, which sets `verificationStatus = verified`. List metadata with `GET /listings/:id/documents`; fetch a file via `GET /listings/:id/documents/:docId/url`. Max file size is 5 MB by default; expect `422` for the wrong file type and `413`-style failures for oversized files.

---

## 7. On-chain title verification

Once a listing is verified, an admin can mint a digital title (`POST /listings/:id/mint-title`). Anyone can verify it:

```ts
const title = await api(`/listings/${id}/title`); // public
// { tokenId, contractAddress, owner, onChainHash, offChainHash, verified }
```

Show a "Verified on-chain" badge when `title.verified === true`. A `404` means no title has been minted yet; `503` means the chain isn't configured in this environment.

---

## 8. Favorites & inquiries

**Favorites** (any authenticated user):

```ts
await api("/favorites", { method: "POST", body: JSON.stringify({ listingId }) });
await api(`/favorites/${listingId}`, { method: "DELETE" });
const saved = await api("/favorites"); // array of listings
```

Saving is idempotent. You can only favorite listings visible to you (published, or your own).

**Inquiries:**

```ts
// tenant sends
await api("/inquiries", { method: "POST", body: JSON.stringify({ listingId, message }) });
// tenant lists what they sent
await api("/inquiries/mine");
// owner lists what they received, then responds
await api("/inquiries/received");
await api(`/inquiries/${id}`, { method: "PATCH", body: JSON.stringify({ response: "Yes!", status: "responded" }) });
```

Only the listing owner (or an admin) may respond/update an inquiry.

---

## 9. Admin surfaces

For admin dashboards (`admin` / `super_admin` only):

- **Review queue:** `GET /admin/listings?status=submitted` (filter by any status, paginated).
- **Document review:** `POST /listings/:id/documents/:docId/review` `{ decision: "approve"|"reject", note? }`.
- **Duplicate warnings:** `GET /listings/:id/duplicates` (non-blocking hints to show during review).
- **KYC review:** `GET /admin/users/:id/kyc`, `POST /admin/users/:id/kyc/review` `{ decision, note? }`, and `GET /admin/users/:id/kyc/documents/:docId/url`.
- **Account status:** `PATCH /admin/users/:id/status` `{ accountStatus }`.
- **Audit trail:** `GET /audit-logs?targetId=<listingOrUserId>&action=<action>` (paginated) — power an activity feed.

---

## 10. HTTP status reference

| Status | Meaning | Frontend action |
| --- | --- | --- |
| `200` / `201` | Success | Read `data` |
| `400` | Bad request (e.g. both spatial modes) | Fix the request |
| `401` | Missing/invalid/expired token | Refresh then retry; else send to login |
| `403` | Authenticated but not allowed (role / account status / ownership) | Show a permission message |
| `404` | Not found (or hidden unpublished listing) | Show empty/not-found UI |
| `409` | Conflict (duplicate email, illegal transition, publish-before-verified) | Show `message` |
| `422` | Validation failed | Map `errors[].field` to inputs |
| `429` | Rate limited | Back off |
| `503` | Dependency unconfigured (uploads / chain) | Feature unavailable in this env |

---

## 11. Recommended workflow

1. Generate a typed client from `/api/docs.json` (e.g. `npx openapi-typescript http://localhost:5000/api/docs.json -o src/api/schema.d.ts`).
2. Wrap fetch with the envelope-unwrapping + token-refresh helper above.
3. Model the listing status machine in the UI so owners only see legal actions.
4. Gate owner "submit listing" on `accountStatus === "active"`; otherwise route them to KYC.
