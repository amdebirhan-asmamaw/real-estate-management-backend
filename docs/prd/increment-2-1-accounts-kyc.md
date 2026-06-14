# PRD — Increment 2.1: Account Lifecycle & KYC (Backend)

**Product:** Decentralized Real Estate Platform
**Increment:** 2.1 (auth hardening — Phase 1 of the hardening plan)
**Scope:** Backend API only.
**Status:** Implemented ✅

---

## 1. Background

Auth previously had only a boolean `isActive`, and every new user — including property owners — became active immediately. A verified real-estate platform must distinguish account states and must not let an unverified owner list property. This increment adds an account lifecycle and an identity-verification (KYC) flow, gating property owners until they are verified.

## 2. Goals & Non-Goals

**Goals**
- Account lifecycle: `accountStatus` ∈ `pending | active | suspended | blocked | rejected`.
- Identity verification: `kycStatus` ∈ `not_started | pending | verified | rejected`, driven by an admin-reviewed KYC document flow.
- Property owners start `pending` and **cannot submit a listing for review until active** (KYC verified).
- Admins can review KYC and directly change account status; all events are audited.
- Groundwork for Web3: `emailVerified`, `walletAddress`, `walletStatus` (custodial minting stays the default).

**Non-Goals**
- Email-verification delivery flow (the `emailVerified` field exists; sending/confirming is later).
- Wallet linking/verification UX (fields are groundwork only).
- Session/refresh hardening (Phase 2 of the hardening plan).

## 3. Functional Requirements

- FR-1: Registration sets `accountStatus` by role — `property_owner` → `pending`, others → `active`. `kycStatus` defaults `not_started`.
- FR-2: Login/refresh are denied for `suspended`/`blocked`/`rejected` (403); `pending` and `active` may authenticate.
- FR-3: A property owner may create draft listings but **cannot `submit`** until `accountStatus === active`. Admins are exempt.
- FR-4: A user uploads private KYC documents (image/PDF, types `national_id|passport|drivers_license|other`); this moves `kycStatus` to `pending`. KYC documents are sha-256 hashed and never returned in user JSON.
- FR-5: KYC documents are retrievable only by the owner or an admin via an authz-gated signed URL.
- FR-6: An admin reviews KYC — approval sets `kycStatus = verified` and `accountStatus = active`; rejection sets `kycStatus = rejected` and leaves the account `pending` (resubmit allowed).
- FR-7: An admin can directly set a user's `accountStatus`.
- FR-8: KYC submission, approval, rejection, and status changes write `user`-scoped audit entries.

## 4. API Surface (`/api/v1`)

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/kyc/documents` | user | Submit private KYC documents (multipart) |
| GET | `/kyc/me` | user | Own KYC status + document metadata |
| GET | `/kyc/documents/:docId/url` | user | Signed URL for own KYC document |
| PATCH | `/admin/users/:id/status` | admin | Set a user's account status |
| GET | `/admin/users/:id/kyc` | admin | A user's KYC status + documents |
| POST | `/admin/users/:id/kyc/review` | admin | Approve/reject a user's KYC |
| GET | `/admin/users/:id/kyc/documents/:docId/url` | admin | Signed URL for a user's KYC document |

## 5. Technical Notes

- `User` model gains the status/kyc/wallet fields; a `pre('validate')` hook sets the role-based `accountStatus` default and derives `walletStatus`. `toJSON` strips `kycDocuments` and `password`.
- `canAuthenticate(status)` centralizes login/refresh gating (`auth.model.ts`).
- KYC reuses `uploadPrivate`/`signedUrl` (`core/utils/uploader.ts`) and `sha256` (`core/utils/hash.ts`); the uploader is mocked in tests.
- The audit log now supports a `targetType` of `user` (added `user.kyc_submitted/approved/rejected`, `user.status_changed`).

## 6. Acceptance Criteria (met)

- Property owners start `pending`; tenants start `active`. ✅
- Suspended/blocked/rejected accounts cannot log in (403). ✅
- A pending owner cannot submit a listing (403); after KYC approval they can. ✅
- KYC submit→approve flips the owner to `active`; documents never leak a public URL; signed-URL access is role-gated. ✅
- Admin status change works and is audited. ✅
- `lint`, `typecheck`, `test` (118), and `build` pass. ✅
