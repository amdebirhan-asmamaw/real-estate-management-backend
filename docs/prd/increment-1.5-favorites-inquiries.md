# PRD — Increment 1.5: Favorites & Inquiries (Backend)

**Product:** Decentralized Real Estate Platform
**Increment:** 1.5 of N (Agile / incremental delivery)
**Scope:** Backend API only. Builds on Increment 1 (verified marketplace core).
**Status:** Implemented ✅

---

## 1. Background

Increment 1 delivered the verified listing marketplace (create → review → publish → discover). Increment 1.5 adds the two consumer-facing engagement features deferred from it, turning passive discovery into an interactive marketplace: **saving listings** and **contacting owners**.

## 2. Goals & Non-Goals

**Goals**
- Authenticated users can save/unsave published listings and list their saved properties.
- Prospective tenants can send an inquiry about a published listing; the owner can view and respond.
- Owners (and admins) see inquiries received on their listings; inquirers see the inquiries they sent.

**Non-Goals**
- Real-time chat/messaging threads (single message + single response only).
- Notifications/email (a later increment).
- Any on-chain logic.

## 3. Functional Requirements

### 3.1 Favorites
- FR-1: Any authenticated user can save a listing that is visible to them (published, or their own). Saving is idempotent.
- FR-2: A user can unsave a listing (idempotent) and list their saved listings (most recent first).
- FR-3: A `(user, listing)` pair is unique. Deleted listings are silently skipped from the favorites list.

### 3.2 Inquiries
- FR-4: An authenticated user can send an inquiry (`message`) about a **published** listing. The listing owner is denormalized onto the inquiry for fast lookups.
- FR-5: The inquirer can list inquiries they sent; the listing owner can list inquiries received.
- FR-6: The listing owner (or an admin) can update an inquiry — add a `response` (auto-marks it `responded`) and/or set `status` (`open|responded|closed`). No one else can.

## 4. API Surface (`/api/v1`)

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/favorites` | user | List saved listings |
| POST | `/favorites` | user | Save a listing (`{ listingId }`) |
| DELETE | `/favorites/:listingId` | user | Unsave a listing |
| POST | `/inquiries` | user | Send an inquiry (`{ listingId, message }`) |
| GET | `/inquiries/mine` | user | Inquiries the caller sent |
| GET | `/inquiries/received` | user | Inquiries on the caller's listings |
| PATCH | `/inquiries/:id` | owner/admin | Respond / update status |

## 5. Technical Notes

- New `favorites` and `inquiries` modules follow the template's routes → controller → service → model + validation pattern.
- Visibility (published-only) is enforced by reusing `listing.service.getListingById`, which already hides non-public listings.
- No new env vars or dependencies.

## 6. Acceptance Criteria (met)

- Save → list → unsave round-trips; saving twice yields one favorite. ✅
- Inquiry on a non-published listing is rejected; sent/received are correctly separated. ✅
- Only the listing owner or an admin can update an inquiry (others 403); responding marks it `responded`. ✅
- `lint`, `typecheck`, `test` (87 tests total), and `build` pass. ✅
