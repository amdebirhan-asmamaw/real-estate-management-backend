# Platform Completion Implementation Plan (Phases A–D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Real Estate Blockchain Marketplace from its current state to the PRD's prototype Definition of Done plus a production-ready posture, by completing the nine trust-layer modules in dependency order.

**Architecture:** Express + Mongoose modular backend (`src/modules/<name>/` = model + validation + service + controller + routes, wired in `src/index.routes.ts`) and a Hardhat/OZ5 contracts repo (`real-estate-contracts`). All money-movement is custodial (`onlyOwner` / admin-gated) and logged to the `chainTransactions` ledger and `audit` log. Notifications are best-effort in-app.

**Tech Stack:** TypeScript, Express 4, Mongoose 8, Joi, ethers v6, Jest + mongodb-memory-server; Solidity 0.8.24 (Cancun), OpenZeppelin 5, Hardhat.

**Source of truth:** `docs/FEATURE_ANALYSIS.md` (gap analysis this plan executes).

**Conventions (follow exactly):**
- Commits: **past-tense, conventional, bullet body** (e.g. `feat(kyc): required a reason on rejection`).
- Mirror the nearest existing module when adding code; do not invent new patterns.
- TDD: write the failing test, see it fail, implement, see it pass, commit.
- Audit every state change via `audit.record(...)`; notify via `notifications` service best-effort.
- Run `npx tsc --noEmit` before each commit; run the relevant `npx jest <file>` (full `npm test` may hit `ENOSPC` on a low-disk machine — run targeted suites and ensure CI has disk headroom).

---

## PHASE A — Close the small gaps

### Task A1: KYC requires rejection reason + uses `under_review` + `resubmitted` audit

**Files:**
- Modify: `src/modules/kyc/kyc.validation.ts`
- Modify: `src/modules/kyc/kyc.service.ts`
- Modify: `src/modules/audit/audit.model.ts`
- Modify: `src/modules/auth/auth.model.ts` (kycStatus already includes `under_review`; confirm)
- Test: `tests/kyc.review.test.ts` (create; mirror an existing service test's DB setup)

- [ ] **Step 1: Write failing tests** — (a) rejecting KYC without a `note` throws a validation/AppError; (b) a fresh submission while status is `pending` transitions to `under_review` when an admin opens it; (c) resubmitting after `rejected` writes a `user.kyc_resubmitted` audit action. Mirror the DB harness used by `tests/lease.service.test.ts`.

- [ ] **Step 2: Run tests, confirm they fail** — `npx jest tests/kyc.review.test.ts` → FAIL (note not required / action missing).

- [ ] **Step 3: Implement.** In `kyc.validation.ts`, make the reason conditional:
```typescript
export const kycReviewSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().max(2000).when("decision", {
    is: "reject",
    then: Joi.required().messages({ "any.required": "A rejection reason is required" }),
    otherwise: Joi.optional(),
  }),
});
```
In `audit.model.ts` add `"user.kyc_resubmitted"` to `AUDIT_ACTIONS`. In `kyc.service.ts`: when a user submits while `kycStatus === "rejected"`, record `user.kyc_resubmitted` (else `user.kyc_submitted`); add an admin transition that sets `kycStatus = "under_review"` (e.g. a `POST /users/:id/kyc/start-review` admin endpoint, or set it automatically when the admin first opens the record) before approve/reject.

- [ ] **Step 4: Run tests, confirm pass** — `npx jest tests/kyc.review.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(kyc): required rejection reason, used under_review, logged resubmission`.

### Task A2: (Optional) KYC `expired` status + expiry field

**Files:** `src/modules/auth/auth.model.ts`, `src/modules/kyc/kyc.service.ts`, `tests/kyc.review.test.ts`

- [ ] **Step 1:** Add `"expired"` to the `kycStatus` enum and an optional `kycVerifiedAt`/`kycExpiresAt` on the user. (Post-MVP: a scheduled job flips `verified → expired`.) Write a unit test that a helper `isKycValid(user)` returns false when `kycExpiresAt < now`.
- [ ] **Step 2–4:** TDD the `isKycValid` helper; have the escrow/listing gates call it instead of `kycStatus === "verified"`.
- [ ] **Step 5: Commit** — `feat(kyc): added expiry support to KYC validity checks`. *(Skip this task if expiry is out of prototype scope — note the decision in the commit/PR.)*

### Task A3: Wallet status granularity (`pending_signature`, `revoked`)

**Files:** `src/modules/auth/auth.model.ts`, `src/modules/auth/auth.service.ts`, `tests/wallet.link.test.ts` (create)

- [ ] **Step 1: Write failing tests** — issuing a challenge sets `walletStatus = "pending_signature"`; a successful link sets `linked`; an admin/security revoke sets `revoked`. Mirror existing auth tests.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — extend the enum to `["unlinked","pending_signature","linked","revoked"]`; set `pending_signature` in `createWalletChallenge`, `linked` in `linkWallet`, `unlinked` in `unlinkWallet`; add a `revokeWallet` path (admin) that sets `revoked`. Keep the existing one-wallet-per-user and active-escrow guards.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(wallet): added pending_signature and revoked wallet statuses`.

### Task A4: Certificate view + PRD-safe wording + proof-record read

**Files:** `src/modules/listings/listing.service.ts`, `src/modules/listings/listing.controller.ts`, `src/modules/listings/listing.routes.ts`, `src/core/blockchain/propertyTitle.service.ts`, `tests/listing.title.test.ts`

- [ ] **Step 1: Write failing test** — `GET /listings/:id/certificate` returns `{ certificateId, propertyId, ownerWallet, verificationDate, documentHash, txHash, status, disclaimer }` for a minted listing, and `{ status: "not_issued" }` otherwise; the `disclaimer` string states it is not legal title.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** a `getCertificate(listingId)` service that reads on-chain title status (map contract `Active/Disputed/Revoked` → `issued/suspended/revoked`) + stored `tokenId/contractAddress/ownershipDocumentHash/blockchainTxHash`, and always includes a `disclaimer` ("Blockchain-backed verification record; not government-recognized legal title."). Wire a public/optional-auth route. Keep existing mint/title endpoints.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(listings): exposed certificate view with proof record and safe wording`.

### Task A5: Admin suspend/restore certificate endpoint

**Files:** `src/modules/listings/listing.service.ts`, `listing.controller.ts`, `listing.routes.ts`, `tests/listing.title.test.ts`

- [ ] **Step 1: Write failing test** — admin `POST /listings/:id/certificate/suspend` calls the contract `markDisputed` and audits `listing.title_disputed`; `.../certificate/restore` calls `clearDispute` and audits `listing.title_dispute_cleared`; both reflected in the certificate view status.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** thin service methods over the existing `propertyTitle.service` dispute/clear calls (these already back the `title_disputed/title_dispute_cleared` audit actions), admin-gated routes, `chainTransactions` logging + notification to the owner.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(listings): added admin certificate suspend and restore endpoints`.

### Task A6: Audit search filters (date range, actor, targetType)

**Files:** `src/modules/audit/audit.service.ts`, `src/modules/audit/audit.validation.ts`, `tests/audit.search.test.ts`

- [ ] **Step 1: Write failing test** — `listAuditLogs` filters by `actor`, `targetType`, and `from`/`to` date range in addition to `action`/`targetId`.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — extend `ListQuery` + filter build with `actor`, `targetType`, and `createdAt: { $gte: from, $lte: to }`; extend the query Joi schema.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(audit): added actor, targetType and date-range search filters`.

### Task A7: Wire remaining notification triggers

**Files:** `src/modules/notifications/notification.model.ts`, `src/modules/compliance/compliance.service.ts`, `src/modules/listings/listing.service.ts`, `tests/notification.firing.test.ts`

- [ ] **Step 1: Write failing test** — opening a compliance case against a listing notifies the listing owner; a new document upload / verification request notifies admins. (Use a spy on `notifications.create`.)
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — add notification types `compliance.case_opened` and `admin.review_requested` to `NOTIFICATION_TYPES`; fire them from `compliance.service.flagSuspiciousListing/createCase` (notify subject/owner) and from the document-upload/verification path (notify admins — resolve admin recipients via `User.find({ role: { $in: ["admin","super_admin"] } })`). Keep best-effort semantics.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(notifications): notified owners on compliance cases and admins on reviews`.

---

## PHASE B — Compliance dashboard completeness (Module 7)

### Task B1: Dedicated review-queue endpoints

**Files:** Create `src/modules/compliance/queues.service.ts`; modify `compliance.controller.ts`, `compliance.routes.ts`; Test: `tests/compliance.queues.test.ts`

- [ ] **Step 1: Write failing tests** — five admin GET queues return the right populations:
  - `GET /compliance/queues/kyc` → users with `kycStatus in [pending, under_review]`
  - `GET /compliance/queues/property-verification` → listings with pending ownership documents / `verificationStatus = pending`
  - `GET /compliance/queues/certificates` → listings `status = approved` && no `tokenId` (issuance candidates)
  - `GET /compliance/queues/disputes` → leases `status = disputed` (+ purchase disputes once Phase C lands)
  - `GET /compliance/queues/suspicious` → open `ComplianceCase`s of type listing/offer flagged suspicious
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** `queues.service.ts` with one paginated function per queue (reuse existing models; no schema changes), admin-gated routes mirroring `compliance.routes.ts` style + a query Joi schema for pagination.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(compliance): added dedicated admin review queues`.

### Task B2: Mark-suspicious endpoint

**Files:** `compliance.service.ts`, `compliance.controller.ts`, `compliance.routes.ts`, `compliance.validation.ts`, `tests/compliance.flag.test.ts`

- [ ] **Step 1: Write failing test** — admin `POST /compliance/flag` with `{ targetType, targetId, severity, title, description? }` opens a `ComplianceCase`, audits `compliance.case_created`, and (Task A7) notifies the subject owner.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — expose the existing programmatic `flagSuspiciousListing`/case-create as an admin endpoint with a Joi body schema.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(compliance): added admin mark-suspicious flag endpoint`.

### Task B3: Super-admin override + restore

**Files:** `src/modules/admin/admin.service.ts`, `admin.controller.ts`, `admin.routes.ts`, `audit.model.ts`, `tests/admin.override.test.ts`

- [ ] **Step 1: Write failing tests** — super_admin can restore a blocked user (`blocked → active`) and override a compliance case resolution; both write audit actions and are denied to plain `admin`.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — add `restoreUser` (blocked/suspended → active, super_admin only) and `overrideComplianceCase` (super_admin sets terminal status with mandatory reason); add audit actions `admin.restored_user`, `admin.override_decision`.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(admin): added super-admin override and restore actions`.

---

## PHASE C — Agreement & escrow depth (Modules 5/6)

### Task C1: Explicit tenant sign/accept stage before funding

**Files:** `src/modules/leases/lease.model.ts`, `lease.service.ts`, `lease.controller.ts`, `lease.routes.ts`, `tests/lease.service.test.ts`

- [ ] **Step 1: Write failing test** — after `propose`, a tenant `POST /leases/:id/sign` records acceptance (`signedByTenantAt`, optional signature/ack) and only then may an admin `fund`; funding a non-signed lease throws.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — add `signedByTenantAt` (and optional `tenantSignature`) to the lease model; add a `sign` service method (tenant-only, state `proposed`, sets the timestamp, audits `lease.signed`, notifies landlord); add the route; add a guard in `fund` requiring `signedByTenantAt`. Add `lease.signed` to audit + a `lease.status_update` notification.
- [ ] **Step 4: Confirm pass** (extend the existing 33-test suite).
- [ ] **Step 5: Commit** — `feat(leases): added explicit tenant sign stage before escrow funding`.

### Task C2: Dispute owner-response window

**Files:** `lease.model.ts`, `lease.service.ts`, `lease.controller.ts`, `lease.routes.ts`, `tests/lease.service.test.ts`

- [ ] **Step 1: Write failing test** — after `dispute`, the counterparty can `POST /leases/:id/dispute/respond` with a statement (stored), and only after a response (or a configurable timeout flag) may admin `dispute/resolve`. Responses are audited.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — add a `dispute` sub-document `{ openedBy, openedAt, reason, response?, respondedBy?, respondedAt? }`; add a `respondToDispute` method (the non-opening party), audit `lease.dispute_responded`; keep admin `resolveDispute` but record the response in metadata. (Owner-response is informative, not blocking, unless product wants hard-blocking — make it a flag.)
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(leases): added dispute owner-response step before resolution`.

### Task C3 (Contracts): Purchase escrow — decide & scaffold

**Files (contracts repo `d:\PROJECTS\real-estate-contracts`):** `contracts/LeaseEscrow.sol` (assess reuse) OR new `contracts/SaleEscrow.sol`; `test/SaleEscrow.test.ts`; `scripts/deploy.ts`; `scripts/export-abi.ts`

> Decision gate: Reuse `LeaseEscrow` for sales (single full-amount deposit released on closing, refunded on cancel) is simplest. A dedicated `SaleEscrow` is cleaner if sale terms diverge (milestones, partial deposits). Default recommendation: **a minimal `SaleEscrow` mirroring `LeaseEscrow`** with states `None → Funded → Released → Refunded` and a single `amount`.

- [ ] **Step 1: Write failing tests** (mirror `test/LeaseEscrow.test.ts`): `openAndFund(saleId, buyer, seller, token, amount, termsHash)` pulls funds; `release` → seller; `refund` → buyer; `onlyOwner`; illegal-transition + unknown-id guards; multi-escrow id increment; allowance-revert.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** `SaleEscrow.sol` (OZ5 Ownable + SafeERC20 + ReentrancyGuard, checks-effects-interactions, token allowlist + non-fee-token caveat NatSpec). Extend `deploy.ts` to deploy it + record `saleEscrow` in `deployments/<network>.json`; extend `export-abi.ts`.
- [ ] **Step 4: Confirm pass** — `npm test` (contracts).
- [ ] **Step 5: Commit** — `feat(contracts): added SaleEscrow for purchase transactions`.

### Task C4 (Backend): SaleEscrow service + ABI + env

**Files:** `src/core/blockchain/saleEscrow.abi.ts`, `src/core/blockchain/saleEscrow.service.ts`, `src/core/config/env.ts`

- [ ] **Step 1:** Add `SALE_ESCROW_CONTRACT_ADDRESS` to `env.ts` (mirror `ESCROW_CONTRACT_ADDRESS`). Create the human-readable ABI (mirror `leaseEscrow.abi.ts`) and the service (mirror `leaseEscrow.service.ts`): `openAndFundEscrow`, `releaseEscrow`, `refundEscrow`, `getEscrow`.
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** — `feat(backend): added SaleEscrow chain service, ABI and env`.

### Task C5 (Backend): Purchase escrow wired into purchaseTransactions

**Files:** `src/modules/purchaseTransactions/purchaseTransaction.model.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`, `audit.model.ts`, `tests/purchaseTransaction.escrow.test.ts`

- [ ] **Step 1: Write failing tests** (mock `saleEscrow.service`, mirror lease tests): admin `fund` on a purchase pulls escrow (gated on **buyer+seller KYC verified + linked wallets + verified property**), status → `deposit_received`; `release` on closing → seller (`completed`); `refund`/`cancel` → buyer (`cancelled`); dispute open + admin resolve (release/refund); each move logged to `chainTransactions` and audited.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — add an `escrow` sub-doc to the purchase model (mirror lease's `escrow`); add service methods `fund/release/refund/dispute/resolveDispute` reusing the lease gating + `trackEscrowTx` chainTransactions wrapper; add admin/party routes; add audit actions `purchase.escrow_funded`, `purchase.escrow_released`, `purchase.escrow_refunded`, `purchase.disputed`, `purchase.dispute_resolved`; fire `purchase.status_update` notifications.
- [ ] **Step 4: Confirm pass** — `npx jest tests/purchaseTransaction.escrow.test.ts`.
- [ ] **Step 5: Commit** — `feat(purchase): added on-chain purchase escrow with disputes`.

### Task C6: Disputes queue includes purchases

**Files:** `src/modules/compliance/queues.service.ts`, `tests/compliance.queues.test.ts`

- [ ] **Step 1–4:** Extend the disputes queue (Task B1) to union `disputed` leases and `disputed` purchase transactions; update the test.
- [ ] **Step 5: Commit** — `feat(compliance): included purchase disputes in the disputes queue`.

---

## PHASE D — Production hardening (cross-cutting)

### Task D1: Chain↔DB reconciliation job + idempotency

**Files:** Create `src/modules/chainTransactions/reconcile.job.ts` (or a script); modify `lease.service.ts` / `purchaseTransaction.service.ts` fund paths; `tests/chainReconcile.test.ts`

- [ ] **Step 1: Write failing test** — a `reconcilePending()` routine reads pending/mined chain transactions, queries receipts via the existing reconcile primitive, and repairs lagging DB escrow state; a second `fund` on an already-funded record is rejected by an idempotency guard.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — a periodic reconcile function reusing `chainTransaction.service` reconcile/mark-stale; add an idempotency key (e.g. unique `chainTransactions` index on `{operation,targetId,nonce}` or a `funding` lock on the lease/purchase) so retries can't double-spend. Schedule via the app's job runner (or document a cron entrypoint).
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(chain): added reconciliation job and funding idempotency guard`.

### Task D2: Token-decimals safety + testnet-only escrow guard

**Files:** `src/core/blockchain/leaseEscrow.service.ts`, `saleEscrow.service.ts`, `src/core/config/env.ts`, `tests/escrow.decimals.test.ts`

- [ ] **Step 1: Write failing test** — `toBaseUnits` derives decimals from the configured token (or asserts 18) and refuses unknown-decimals; opening escrow against a mainnet token throws unless `ALLOW_MAINNET_ESCROW=true`.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement** — query `decimals()` once and cache (or assert == 18 at boot); add `ALLOW_MAINNET_ESCROW` env (default false) and a network/token guard.
- [ ] **Step 4: Confirm pass.**
- [ ] **Step 5: Commit** — `feat(escrow): enforced token-decimals safety and testnet-only guard`.

### Task D3: Custody / secrets posture

**Files:** `docs/SECURITY.md` (create), `src/core/blockchain/*.service.ts`

- [ ] **Step 1:** Document the production custody upgrade (KMS/HSM or signing service for `MINTER_PRIVATE_KEY`, key rotation, splitting the contract `owner` from the `*_OPERATOR_ROLE` so day-to-day ops use a separate operator wallet — contracts already support this). Add a startup warning if a raw private key is used with `NODE_ENV=production`.
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** — `docs(security): documented custodial key and operator-split posture`.

### Task D4: Integration test suite + CI disk headroom

**Files:** `tests/integration/*.test.ts`, CI config

- [ ] **Step 1:** Add integration tests for the cross-module flows: offer→purchase escrow→completion; rental-application→lease→escrow→completion; compliance flag→queue→resolve; notification firing across these. Reuse the existing in-memory Mongo harness.
- [ ] **Step 2:** Ensure the CI runner provides disk headroom for `mongodb-memory-server` (the cause of local `ENOSPC`); document running targeted suites locally.
- [ ] **Step 3: Commit** — `test: added cross-module integration coverage`.

---

## Self-review (coverage vs FEATURE_ANALYSIS.md)

- Module 1 KYC → A1 (+A2 optional). Module 2 Wallet → A3. Module 3 Proof → A4. Module 4 Certificate → A4/A5. Module 5 Agreement → C1 (+C3–C5 purchase). Module 6 Escrow → C2 (dispute), C3–C5 (purchase escrow), D1/D2 (hardening). Module 7 Compliance → B1/B2/B3 (+C6). Module 8 Audit → A6 (+ new actions throughout). Module 9 Notifications → A7 (+ fired in every new flow).
- Cross-cutting: chain↔DB → D1; decimals/testnet → D2; custody → D3; tests → D4.
- Definition-of-Done items all map to a task; the two true build items (compliance queues, purchase escrow) are Phases B and C.

**Sequencing rationale:** A (broad, low-risk DoD progress) → B (admin oversight, unblocks reviewing everything else) → C (deepest feature work, depends on A's notifications/audit) → D (hardening, depends on C's escrow surface existing).

**Verification (end-to-end):** after each phase, run the phase's targeted jest suites + `npx tsc --noEmit`; for contracts, `npm test` in the contracts repo. Final acceptance: walk the PRD DoD table in `docs/FEATURE_ANALYSIS.md` and confirm each row is green via the relevant endpoint(s) in Swagger (`GET /api/docs`).
