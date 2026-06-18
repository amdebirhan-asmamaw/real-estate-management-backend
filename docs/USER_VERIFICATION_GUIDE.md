# User Verification & KYC — Frontend Integration Guide

> Companion to `FRONTEND_GUIDE.md` and `LISTINGS_GUIDE.md`. Covers the complete user lifecycle: registration, account status, KYC verification flow, admin review, profile management, sessions, password flows, and wallet linking.

---

## 1. The User Object

Returned from `GET /auth/me`, login, register, and profile endpoints.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | User ID |
| `name` | `string` | Display name |
| `email` | `string` | Unique, lowercase |
| `role` | `string` | See roles below |
| `phone` | `string?` | Optional |
| `profileImage` | `string?` | URL |
| `accountStatus` | `string` | See account lifecycle |
| `kycStatus` | `string` | See KYC lifecycle |
| `emailVerified` | `boolean` | Reserved for future email verification |
| `mustResetPassword` | `boolean` | Force password change on next login |
| `walletAddress` | `string?` | EVM address (e.g. `0xabc...`) |
| `walletStatus` | `string` | `"unlinked" \| "pending_signature" \| "linked" \| "revoked"` |

> **Never returned:** `password`, `kycDocuments`, `walletLinkChallenge`, `passwordResetToken`, `failedLoginAttempts`. These are server-side only.

---

## 2. Roles

| Role | Self-registerable | Default `accountStatus` |
|---|---|---|
| `tenant` | ✅ | `active` (immediately usable) |
| `property_owner` | ✅ | `pending` (must pass KYC) |
| `admin` | ❌ admin-provisioned only | `active` |
| `super_admin` | ❌ seed only | `active` |

---

## 3. Account Status Lifecycle

```
pending ──KYC approved──▶ active
                          ──suspend──▶ suspended ──reactivate──▶ active
                          ──block──▶ blocked
                          ──reject──▶ rejected
```

| Status | Can log in? | Description |
|---|---|---|
| `pending` | ✅ (limited) | Property owners awaiting KYC |
| `active` | ✅ | Full access |
| `suspended` | ❌ `403` | Temporarily restricted |
| `blocked` | ❌ `403` | Policy violation |
| `rejected` | ❌ `403` | Verification rejected permanently |

**Gating rule:** Returning `403` on login includes a human-readable `message`. Show it directly — e.g. `"Account is suspended"`.

**Frontend tip:** After login, check `accountStatus`. If `pending`, route property owners to the KYC onboarding flow.

---

## 4. KYC Status Lifecycle

```
not_started ──upload docs──▶ pending ──admin starts review──▶ under_review
                                                               ──approve──▶ verified (account becomes active)
                                                               ──reject──▶ rejected ──resubmit──▶ pending
                             ──reject (from pending)──▶ rejected
                             verified ──(expiry date passed)──▶ expired
```

| Status | Meaning | Owner action |
|---|---|---|
| `not_started` | No documents uploaded | Show "Start KYC" prompt |
| `pending` | Docs uploaded, awaiting review | Show "Under review" |
| `under_review` | Admin is actively reviewing | Show "Under review" |
| `verified` | Passed — account is active | Show verified badge |
| `rejected` | Rejected — show `reviewNote` | Allow re-upload |
| `expired` | Verification expired | Allow re-upload |

---

## 5. KYC Onboarding Flow (Property Owners)

This is the critical onboarding path. Build it as a multi-step flow:

```
Register → Check accountStatus
         ├─ active → main app
         └─ pending → KYC onboarding
              ├─ Step 1: Upload documents (POST /kyc/documents)
              ├─ Step 2: Poll GET /kyc/me for status
              │    ├─ pending / under_review → "Under review" screen
              │    ├─ rejected → show reviewNote + allow re-upload
              │    └─ verified → unlock main app + show success
              └─ (kycStatus === "verified" + accountStatus === "active") → done
```

### Step 1 — Upload KYC documents

```ts
const form = new FormData();
form.append("type", "passport"); // "national_id" | "passport" | "drivers_license" | "other"
files.forEach((f) => form.append("documents", f)); // field name must be "documents"

await fetch("/api/v1/kyc/documents", {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  // Do NOT set Content-Type — browser sets multipart boundary automatically
  body: form,
});
```

- Accepted types: images or PDF
- Max 5 MB per file
- Multiple files allowed in a single request
- After upload → `kycStatus` becomes `"pending"`
- Re-uploading after a rejection appends new documents and moves status back to `"pending"` (audit records it as a `kyc_resubmitted` event)

### Step 2 — Poll KYC status

```ts
const kyc = await api("/kyc/me");
// {
//   kycStatus: "pending",
//   accountStatus: "pending",
//   reviewNote: null,
//   documents: [{ id, type, status, hash, uploadedAt }]
// }
```

Poll on a reasonable interval (e.g. every 30 seconds while user is on the waiting screen). Stop polling when `kycStatus` is `"verified"` or `"rejected"`.

### Step 3 — Handle rejection

```ts
if (kyc.kycStatus === "rejected") {
  // Show kyc.reviewNote to the user
  // Let them re-upload with corrected documents
}
```

On rejection, `reviewNote` contains the admin's explanation. Show it prominently and provide a "Re-upload documents" button.

### Step 4 — Verified

When `kycStatus === "verified"`, `accountStatus` is automatically set to `"active"`. The user can now:
- Submit listings for review
- Access all property-owner features

---

## 6. Get Own KYC Summary

```ts
const kyc = await api("/kyc/me");
```

Response shape:

```json
{
  "kycStatus": "verified",
  "accountStatus": "active",
  "reviewNote": null,
  "documents": [
    {
      "id": "64abc...",
      "type": "passport",
      "status": "approved",
      "hash": "sha256...",
      "uploadedAt": "2026-06-01T10:00:00Z"
    }
  ]
}
```

> `publicId` is **never** returned. Only `hash` (SHA-256) is exposed to confirm document integrity.

---

## 7. View a KYC Document (Signed URL)

Documents are private — there is no public URL. Request a short-lived signed URL:

```ts
const { url } = await api(`/kyc/documents/${docId}/url`);
// url is a short-lived Cloudinary signed URL
// Open in a new tab or display inline
```

The URL expires quickly — do not cache it.

---

## 8. Profile Management

### Update profile

```ts
await api("/auth/profile", {
  method: "PATCH",
  body: JSON.stringify({
    name: "Ada Lovelace",
    phone: "+251911000000",
    profileImage: "https://cdn.example.com/avatars/ada.jpg",
  }),
});
```

All fields optional; at least one required (`422` otherwise). Returns updated user object.

### Get current user

```ts
const user = await api("/auth/me");
```

---

## 9. Session Management

Sessions use **refresh token rotation**. Each refresh issues a new token and revokes the previous one. Reusing a rotated token revokes the entire session family.

### List active sessions

```ts
const sessions = await api("/auth/sessions");
// [{ id, userAgent, ip, createdAt, expiresAt }, ...]
```

Use this to build a "Devices" page showing where the user is logged in.

### Logout current session

```ts
await fetch("/api/v1/auth/logout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ refreshToken }),
});
```

### Logout all sessions (e.g. "Sign out everywhere")

```ts
await api("/auth/logout-all", { method: "POST" });
```

This revokes every active refresh token for the user. Use after a password change or suspected account compromise.

---

## 10. Password Flows

### Change password (authenticated)

```ts
await api("/auth/change-password", {
  method: "POST",
  body: JSON.stringify({
    currentPassword: "OldPass1",
    newPassword: "NewPass2",
  }),
});
```

- Verifies `currentPassword` before accepting
- Revokes **all** sessions after change
- Notifies the user by email/notification
- Clears `mustResetPassword` flag

**Password requirements:** ≥ 8 characters, at least one uppercase letter, at least one number.

### Forgot password (public)

```ts
await fetch("/api/v1/auth/forgot-password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com" }),
});
// Always returns 200 — does not reveal whether email exists
```

The raw reset token is returned in the response body (dev mode) or sent via a notification. Token expires in **1 hour**.

### Reset password (public)

```ts
await fetch("/api/v1/auth/reset-password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: "<raw-token-from-email>",
    newPassword: "NewPass1",
  }),
});
```

- Single-use token
- Revokes all sessions after reset
- Sends confirmation notification

### `mustResetPassword` flag

If `user.mustResetPassword === true` after login, redirect the user to the change-password screen before allowing any other action. Admin-provisioned accounts may have this set.

---

## 11. Wallet Linking (Blockchain)

Link an EVM wallet to enable on-chain title minting directly to the owner's address.

### Step 1 — Request a signing challenge

```ts
const challenge = await api("/auth/wallet/challenge", {
  method: "POST",
  body: JSON.stringify({ walletAddress: "0xabc...123" }),
});
// { walletAddress, message, expiresAt }
```

The challenge `message` is a human-readable string. Present it to the wallet for signing. Expires in **10 minutes**.

### Step 2 — Sign and link

```ts
// Using ethers.js or wagmi
const signature = await signer.signMessage(challenge.message);

const user = await api("/auth/wallet/link", {
  method: "POST",
  body: JSON.stringify({
    walletAddress: "0xabc...123",
    signature,
  }),
});
```

- Verifies the signature cryptographically on the server
- Links the wallet if the address matches and is not already linked to another account
- Sets `walletStatus` to `"linked"`

### Step 3 — Unlink

```ts
await api("/auth/wallet", { method: "DELETE" });
```

- Cannot unlink if there are active/funded lease escrows (`409`)
- Sets `walletStatus` to `"unlinked"`

### `walletStatus` values

| Status | Meaning |
|---|---|
| `unlinked` | No wallet connected |
| `pending_signature` | Challenge issued, waiting for user to sign |
| `linked` | Wallet verified and active |
| `revoked` | Admin-revoked (distinguishable from unlinked in audit trails) |

---

## 12. Admin — KYC Review

### Get a user's KYC summary

```ts
const kyc = await api(`/admin/users/${userId}/kyc`);
// Same shape as /kyc/me but for any user
```

### Start review (move pending → under_review)

```ts
await api(`/admin/users/${userId}/kyc/start-review`, { method: "POST" });
```

Only valid from `kycStatus === "pending"`.

### Approve or reject KYC

```ts
// Approve
await api(`/admin/users/${userId}/kyc/review`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve" }),
});

// Reject — note is REQUIRED on rejection
await api(`/admin/users/${userId}/kyc/review`, {
  method: "POST",
  body: JSON.stringify({
    decision: "reject",
    note: "ID document is expired. Please upload a valid passport.",
  }),
});
```

**Effects of approval:**
- `kycStatus` → `"verified"`, `kycVerifiedAt` set
- `accountStatus` → `"active"`
- All pending KYC documents → `"approved"`
- User receives `kyc.approved` notification

**Effects of rejection:**
- `kycStatus` → `"rejected"`
- `accountStatus` stays as-is (user can resubmit)
- All pending KYC documents → `"rejected"`
- User receives `kyc.rejected` notification with `note`
- A compliance flag is raised internally

### View a user's KYC document (admin)

```ts
const { url } = await api(`/admin/users/${userId}/kyc/documents/${docId}/url`);
```

---

## 13. Admin — Account Status Management

```ts
await api(`/admin/users/${userId}/status`, {
  method: "PATCH",
  body: JSON.stringify({ accountStatus: "suspended" }),
  // "pending" | "active" | "suspended" | "blocked" | "rejected"
});
```

**Permission guards:**
- Cannot modify `super_admin` accounts (any admin)
- Cannot modify `admin` accounts unless you are `super_admin`

**Notifications sent:**
| New status | Notification |
|---|---|
| `suspended` | "Your account has been suspended" |
| `blocked` | "Your account has been blocked" |
| `active` | "Your account has been reactivated" |
| `pending` / `rejected` | No notification |

---

## 14. Key Status Combinations & UI States

| `accountStatus` | `kycStatus` | UI State |
|---|---|---|
| `active` | `verified` | ✅ Full access |
| `pending` | `not_started` | 🔵 Show KYC start prompt |
| `pending` | `pending` | ⏳ "Documents under review" |
| `pending` | `under_review` | ⏳ "Being actively reviewed" |
| `active` | `rejected` | ⚠️ Show rejection note + re-upload (rare: admin manually activated) |
| `pending` | `rejected` | ⚠️ Show rejection note + re-upload |
| `suspended` | any | 🔴 Show suspension message + support link |
| `blocked` | any | 🔴 Show blocked message |
| `rejected` | any | 🔴 Show account rejection message |

---

## 15. Recommended Frontend Patterns

1. **Onboarding gate:** After login check `accountStatus`. If `pending`, redirect property owners to a dedicated KYC onboarding page before any other action.
2. **KYC status polling:** Poll `GET /kyc/me` every 30s while on the waiting screen. Use exponential backoff after 5 minutes.
3. **Rejection UX:** When `kycStatus=rejected`, show `reviewNote` prominently with a "Fix & Resubmit" CTA.
4. **`mustResetPassword` gate:** Always check on login — redirect to change-password before anything else.
5. **Session list ("Devices"):** Use `GET /auth/sessions` to show a list of active sessions with device/IP info. Provide per-session revoke via `POST /auth/logout` (logout current) or `POST /auth/logout-all`.
6. **Wallet connect flow:** Use a "Connect Wallet" button that triggers the challenge-sign-link 2-step flow. Show `walletStatus` as a badge on the profile page.
7. **Listing submission gate:** Always check `accountStatus === "active"` and `kycStatus === "verified"` before allowing a listing to be submitted. Return a targeted message for each failure case.

---

## 16. Error Reference (KYC & Auth)

| Status | Scenario | Frontend action |
|---|---|---|
| `401` | Invalid/expired token | Refresh token then retry; redirect to login if refresh fails |
| `403` on login | `accountStatus` is `suspended`/`blocked`/`rejected` | Show `message` from response body |
| `403` | Trying to modify another user's KYC | Show permissions error |
| `403` | Admin trying to modify `super_admin` | Show permissions error |
| `409` | KYC not in correct state for action | Show `message` — e.g. "KYC must be pending to start review" |
| `409` | Wallet already linked to another account | Show conflict message |
| `409` | No active wallet challenge / challenge expired | Restart challenge flow |
| `409` | Cannot unlink wallet — active escrow | Explain escrow must be settled first |
| `422` | Password missing uppercase/number, name too short | Map `errors[].field` to form inputs |
| `429` | Too many auth requests | Back off — show retry countdown |
