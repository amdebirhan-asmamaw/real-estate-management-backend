# PRD — Increment 2.2: Session Store & Refresh Hardening (Backend)

**Product:** Decentralized Real Estate Platform
**Increment:** 2.2 (auth hardening — Phase 2 of the hardening plan)
**Scope:** Backend API only.
**Status:** Implemented ✅

---

## 1. Background

Refresh tokens were previously stateless and unrevocable — any valid refresh JWT worked until expiry, with no logout, rotation, or revocation. This increment adds a server-side session store so sessions can be rotated, listed, and revoked.

## 2. Goals & Non-Goals

**Goals**
- Persist refresh tokens as **hashed** server-side sessions (the raw token is never stored).
- **Rotate** the refresh token on every use; detect reuse of a rotated token and revoke the whole session family.
- Endpoints for logout, logout-all-devices, listing active sessions, and changing password (which revokes all sessions).

**Non-Goals**
- Access-token revocation lists (access tokens stay short-lived/stateless; revocation is enforced at refresh time).
- Email/2FA flows.

## 3. Functional Requirements

- FR-1: Register and login persist a `RefreshSession { user, tokenHash, family, userAgent?, ip?, expiresAt, revokedAt? }` (token hashed with sha-256).
- FR-2: `POST /auth/refresh-token` verifies the JWT, finds the session by hash, rejects missing/expired/revoked, then rotates — revokes the presented session and issues a new one in the same `family`.
- FR-3: Presenting an already-rotated (revoked) token is treated as reuse and revokes every live token in that family.
- FR-4: `POST /auth/logout` revokes the presented refresh token's session (idempotent).
- FR-5: `POST /auth/logout-all` revokes every active session for the user.
- FR-6: `GET /auth/sessions` lists the caller's active sessions (no token hashes).
- FR-7: `POST /auth/change-password` verifies the current password, sets the new one, and revokes all sessions.
- FR-8: Every issued token carries a unique `jti` so two tokens are never identical (rotation safety).

## 4. API Surface (`/api/v1`)

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/logout` | — (presents token) | Revoke one session |
| POST | `/auth/logout-all` | user | Revoke all sessions |
| GET | `/auth/sessions` | user | List active sessions |
| POST | `/auth/change-password` | user | Change password + revoke all sessions |

(Existing `/auth/refresh-token` now rotates.)

## 5. Technical Notes

- `session.model.ts` indexes `tokenHash` (unique) and `user`/`family`.
- Hashing reuses `core/utils/hash.sha256`; expiry is derived from the refresh JWT's `exp` (`getTokenExpiry` in `core/utils/jwt.ts`).
- Controllers capture `user-agent` + `ip` and pass them through as session context.
- Recommended `JWT_EXPIRES_IN=15m` (documented in `.env.example`).

## 6. Acceptance Criteria (met)

- Refresh rotates (new token works, old is revoked); reuse of a rotated token revokes the family. ✅
- Logout revokes one session; logout-all revokes all; sessions list omits hashes. ✅
- Change-password rejects a wrong current password, revokes sessions, and the new password works while the old fails. ✅
- `lint`, `typecheck`, `test`, and `build` pass. ✅
