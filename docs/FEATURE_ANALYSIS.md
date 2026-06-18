# Feature Analysis & Completion Roadmap

**Date:** 2026-06-16
**Scope:** `real-estate-backend` (Express/Mongo) + `real-estate-contracts` (Hardhat/Solidity)
**Reference:** Project Description + PRD "Trust, Blockchain, Escrow & Compliance Modules"

## Context

**2026-06-18 implementation update:** purchase escrow, geo clustering/geocoding, rental yield tracking, chain reconciliation workers, saved-search catch-up alerts, expanded readiness checks, and request correlation IDs have since been implemented. The remaining hardening focus is operational deployment discipline: managed signer/KMS, production monitoring, backup/restore rehearsal, external provider SLAs, and legal/compliance sign-off before any mainnet escrow use.

This document assesses the **current** implementation state of the two repos against the PRD's nine trust-layer modules and the project's four scope areas, and lays out exactly what remains to reach the PRD's **Prototype Definition of Done** and a production-ready posture. It is the single source of truth for "what's left to build."

**Headline:** the platform is substantially further along than a greenfield prototype. All nine PRD modules exist in some form; most are functional. The remaining work is **completion and hardening**, not net-new subsystems — with three genuine feature gaps (purchase escrow, dedicated compliance queues, a few status/audit refinements) and a set of cross-cutting production concerns (chain/DB consistency, secrets, test coverage, real-money guardrails).

## Maturity scorecard (PRD modules)

| # | Module | Status | Gap size |
|---|--------|--------|----------|
| 1 | KYC & User Verification | 🟢 EXISTS | Small (status enum, rejection-reason) |
| 2 | Wallet Linking | 🟢 EXISTS | Small (status granularity) |
| 3 | Blockchain Property Verification | 🟢 EXISTS | Small (naming/"proof record" vs mint) |
| 4 | Digital Title Certificate / NFT | 🟢 EXISTS | Small (certificate status surface) |
| 5 | Rental / Purchase Agreement | 🟡 PARTIAL | Medium (purchase agreement; explicit tenant sign) |
| 6 | Escrow Flow | 🟡 PARTIAL | Medium (purchase escrow; dispute response window) |
| 7 | Compliance Dashboard | 🟡 PARTIAL | Medium (dedicated review queues, mark-suspicious endpoint) |
| 8 | Audit Logs | 🟢 EXISTS | Small (a few missing actions, search filters) |
| 9 | Notifications | 🟡 PARTIAL | Small (a few unwired triggers; in-app only) |

Legend: 🟢 working end-to-end · 🟡 present but incomplete · 🔴 missing.

---

## Module-by-module analysis

### Module 1 — KYC & User Verification 🟢
**Exists:** Submit documents (private Cloudinary + sha256), admin review approve/reject, account-status gating, signed-URL document access, audit logging. KYC enforced as a gate on listing submission and escrow funding (`lease.service.ts`).
**Gaps to close:**
- `kycStatus` enum is `not_started | pending | under_review | verified | rejected` — PRD wants `UNDER_REVIEW` actually used and an `EXPIRED` state. `under_review` is defined but never transitioned to.
- Rejection reason is **optional**; PRD requires a reason on rejection. Make `note` required when `decision = reject` (`kyc.validation.ts`).
- No `user.kyc_resubmitted` audit action (resubmit currently looks like a status change).
- (Post-MVP) KYC expiry/refresh job.

### Module 2 — Wallet Linking 🟢
**Exists:** Full challenge → EIP-191 sign → `ethers.verifyMessage` → link flow, nonce with 10-min TTL, one-wallet-per-user enforcement, unlink guarded against active escrows (`auth.service.ts:386-520`).
**Gaps to close:**
- `walletStatus` is only `unlinked | linked`. PRD lists `NOT_LINKED, PENDING_SIGNATURE, LINKED, UNLINKED, REVOKED`. Add `pending_signature` (set when challenge issued) and `revoked` (admin/security revoke) if you want full PRD parity — otherwise document the simplification.

### Module 3 — Blockchain Property Verification 🟢
**Exists:** Admin document review sets `verificationStatus = verified`; `propertyTitle.service.ts` anchors `listingId + documentHash` on-chain; `chainTransactions` module is a full on-chain ledger (operations, statuses `pending→mined→confirmed/reconciled`, admin reconcile/mark-stale reading receipts via ethers). Only proof data goes on-chain — private docs stay in Cloudinary. ✅ matches PRD §19/§20.
**Gaps to close:**
- PRD frames a "blockchain **proof record**" distinct from "minting an NFT." Today minting is the only on-chain write for a property. This is acceptable (the mint *is* the proof), but **surface it with PRD-safe wording** in API/UI: "blockchain-backed verification record," not "legal title." Add a read endpoint/section that returns {propertyId, documentHash, ownerWallet, verificationDate, txHash, certificateId} as a "proof record" view.
- Consider a `blockchain_proof_created` audit action distinct from `listing.title_minted` if product wants the two concepts separated.

### Module 4 — Digital Title Certificate / NFT 🟢
**Exists (contracts):** `PropertyTitle.sol` is well beyond a basic mint — per CLAUDE.md it has a `TitleStatus { None, Active, Disputed, Revoked }` lifecycle (`markDisputed`/`clearDispute`/`revokeTitle`), listing dedup (idempotent mint per `listingId`), and off-chain metadata via `setBaseURI` + `tokenURI`. Two-tier access (owner admin + `TITLE_OPERATOR_ROLE`). Backend exposes mint + read; audit covers `title_minted/disputed/dispute_cleared/revoked`.
**Gaps to close:**
- Map the contract's `Active/Disputed/Revoked` to the PRD certificate statuses `ISSUED/SUSPENDED/REVOKED` and expose a clean **certificate view** on the property detail (certificate id, owner wallet, verification date, document hash, tx hash, status). PRD MVP only needs `NOT_ISSUED/ISSUED/SUSPENDED`.
- Add an explicit admin "suspend certificate" endpoint mapped to `markDisputed` (or a dedicated suspend) if product wants suspension separate from dispute.
- Keep the "not legal title" disclaimer in every certificate response (risk §55).

### Module 5 — Rental / Purchase Agreement 🟡
**Exists:** Rental path is strong: `rentalApplications` (submit → screening → approve/reject → `lease_created`) → `leases` (draft → proposed → active …). Purchase path: `offers` (submitted/accepted/rejected/countered/cancelled) → `purchaseTransactions` (offer_accepted → deposit_pending → … → completed).
**Gaps to close:**
- **Purchase agreement is thin:** `purchaseTransactions` is admin-driven status transitions with a closing checklist but **no escrow and no signing**. Either (a) build a purchase agreement + escrow flow analogous to leases, or (b) explicitly scope purchase as "off-chain coordination only" for the prototype and document it.
- **No explicit tenant sign/accept stage:** lease goes `proposed` (owner) → admin `fund`. PRD wants `PENDING_TENANT_REVIEW → SIGNED` before escrow. Add a tenant `accept/sign` transition (record signature or acknowledgement + optional on-chain `termsHash` proof) between `proposed` and `fund`.
- Map lease statuses to PRD agreement vocabulary or document the deliberate mapping.

### Module 6 — Escrow Flow 🟡
**Exists:** Lease escrow is real and on-chain: `LeaseEscrow.sol` (ERC-20, token allowlist, custodial `onlyOwner`), split-release (first month → landlord on activate, deposit held, settled on complete/terminate), pre-activation cancel, dispute → admin resolve (cancel / release_deposit / refund_deposit), all gated on KYC + linked wallet + published listing, every move logged to `chainTransactions`. ✅ strong.
**Gaps to close:**
- **Escrow sub-states are simplified** (`none/funded/active/closed`) vs PRD's 8 (`PENDING_DEPOSIT, FUNDED, RELEASED, REFUNDED, DISPUTED, …`). Either expand the persisted sub-state for richer reporting, or document the mapping (the dispute decision already records release vs refund).
- **No dispute "owner response window":** tenant opens, admin decides unilaterally. PRD §40 wants owner to respond before admin rules. Add an owner-response step + a `disputed` sub-flow.
- **Purchase escrow missing** (see Module 5).
- Keep **test-funds-only** guardrails explicit (risk §55/§39): refuse mainnet token addresses unless a deliberate `ALLOW_MAINNET_ESCROW` flag is set.

### Module 7 — Compliance Dashboard 🟡
**Exists:** `compliance` module (cases with type/status/severity/notes/assignment, broker-license submit+review, programmatic suspicious-flagging), `admin` module (suspend/block/reactivate users, manage admins = super_admin only), listing/user/document review actions, all audited.
**Gaps to close (most impactful module for "dashboard" completeness):**
- **Dedicated review queues** are missing — today admins filter generic lists. Add purpose-built endpoints: pending-KYC queue, pending-property-verification queue, certificate-issuance queue, escrow-dispute queue, reported/suspicious-listings queue (PRD §43).
- **No admin endpoint to mark a listing/user suspicious** — flagging is programmatic only. Add `POST /compliance/flag` (admin).
- **Super-admin "override" action** is not implemented (PRD §44). Add override + restore-blocked-user paths.
- Wire dispute cases into a compliance queue view so disputes are visible alongside other cases.

### Module 8 — Audit Logs 🟢
**Exists:** ~47 action types across auth/admin/KYC/listings/leases/compliance/purchase/rental; admin-only `GET /audit-logs` filterable by action/target; metadata captures context. Append-only.
**Gaps to close:**
- Missing actions: `user.kyc_resubmitted`, explicit escrow `deposit_made/released/refunded` (currently folded into `lease.*`), and an explicit `blockchain_proof_created` if Module 3 splits the concept.
- Add search filters by **date range, actor, targetType** (`audit.service.ts`).
- Add a written "reason/note" requirement for sensitive admin actions (PRD §47) — partially covered by metadata.

### Module 9 — Notifications 🟡
**Exists:** In-app `notifications` module (20 types, read/unread, paginated, mark-read/read-all), wired into auth, KYC, listings, inquiries, offers, leases, purchases, rental applications, saved searches. Best-effort (never breaks business ops).
**Gaps to close:**
- Unwired triggers: compliance-case-opened → notify the affected owner; admin alerts for new document uploads / new verification requests / new disputes (PRD §49 admin notifications).
- In-app only — email is post-MVP per PRD §50, fine for prototype; add an email channel behind a flag when ready.

---

## Cross-cutting production-readiness concerns

These apply across modules and gate "production ready" independent of features:

1. **Chain↔DB consistency.** Every escrow transition calls the chain *before* `lease.save()` (documented trade-off in `lease.service.ts`). For production add the **reconciliation job** that reads on-chain state via `getEscrow`/receipts (the `chainTransactions` reconcile primitives already exist — schedule them) and repairs lagging DB state. Add idempotency keys to avoid double-fund on retry.
2. **Token decimals.** Escrow hardcodes 18 decimals; a 6-decimal stablecoin (USDC) would mis-scale amounts. Read `decimals()` or assert at boot before any mainnet use.
3. **Real-money / legal guardrails.** Enforce testnet-only escrow in the prototype; keep "not legal title" disclaimers on certificate/proof responses (PRD §55). Gate mainnet behind an explicit env flag + review.
4. **Secrets & custody.** `MINTER_PRIVATE_KEY` is a single custodial hot wallet for mint + escrow. For production: KMS/HSM or a signing service, key rotation, and separate operator wallets from the admin owner (the contracts already support splitting owner vs `*_OPERATOR_ROLE`).
5. **Test coverage.** Contracts: 57 tests (PropertyTitle + LeaseEscrow) — strong. Backend: lease state machine well covered; **add integration tests** for offers→purchase, rental-application→lease, compliance flows, and notification firing. Note the local **MongoMemoryServer ENOSPC** issue — needs free disk/CI runner with space.
6. **Wallet/KYC gates consistency.** Gates exist for lease escrow; replicate the same KYC+wallet+verified-property checks on any new purchase-escrow path.
7. **Observability & rate limits.** Confirm rate limiting on sensitive endpoints (mint, fund, dispute resolve), structured audit on every money move (present), and error monitoring for chain calls.

## Smart contracts (`real-estate-contracts`)

**State:** `PropertyTitle.sol` (mint + dedup + Active/Disputed/Revoked lifecycle + tokenURI + two-tier access) and `LeaseEscrow.sol` (ERC-20 escrow, allowlist, split-release, dispute settlement) with `MockERC20`, deploy + ABI export, and a passing test suite. Solidity 0.8.24 / Cancun / OZ 5.
**To complete:**
- Optional **purchase escrow** contract (or reuse `LeaseEscrow` with a "sale" mode) if Module 5/6 purchase path is built on-chain.
- Production deploy runbook (real stablecoin allowlist, operator-vs-owner role split, verified source on explorer).
- Fee-on-transfer/decimals assumptions already documented — keep enforced.

---

## Recommended completion roadmap

Ordered to reach the PRD **Definition of Done** fastest, building on what exists (PRD §57 build order, adjusted for current state):

**Phase A — Close the small gaps (highest ROI, mostly backend):**
1. KYC: require rejection reason; use `under_review`; add `kyc_resubmitted` audit + (optional) `expired`.
2. Wallet: add `pending_signature` (+ `revoked`) statuses, or document simplification.
3. Certificate view + PRD-safe wording; expose "proof record" read; map cert statuses; add admin suspend-certificate.
4. Audit: add missing actions + date/actor/targetType search filters.
5. Notifications: wire compliance-case + admin alerts.

**Phase B — Compliance dashboard completeness (Module 7):**
6. Dedicated review-queue endpoints (KYC, property verification, certificate issuance, disputes, suspicious).
7. `POST /compliance/flag` (mark suspicious) + super-admin override/restore.

**Phase C — Agreement/escrow depth (Modules 5/6):**
8. Explicit tenant **sign/accept** stage before fund (record acknowledgement + optional on-chain termsHash).
9. Dispute **owner-response window** before admin resolution.
10. **Purchase escrow**: decide on-chain vs off-chain; if on-chain, add purchase-escrow contract + backend flow mirroring leases (KYC+wallet+verified gates, chainTransactions logging).

**Phase D — Production hardening (cross-cutting):**
11. Scheduled chain↔DB reconciliation job + idempotency keys.
12. Token-decimals safety; testnet-only enforcement + mainnet flag.
13. Secrets/custody upgrade (KMS, operator/owner split).
14. Integration test suite + CI runner with disk headroom.
15. (Post-MVP) email notifications, KYC expiry, advanced compliance analytics, certificate transfer.

## Prototype Definition of Done — current status

| PRD DoD item | Status |
|---|---|
| Users can submit KYC | ✅ done |
| Admins approve/reject KYC | ✅ done (add required reason) |
| Users can link wallet | ✅ done |
| Verified properties receive blockchain proof | ✅ done (mint = proof) |
| Digital certificate issued for verified property | ✅ done (surface view + wording) |
| Tenant can start agreement request | ✅ rental ✅ / purchase 🟡 |
| Escrow demo works with test funds | ✅ leases ✅ / purchase 🔴 |
| Admin monitors KYC/property/certificate/escrow | 🟡 works via filters; needs dedicated queues |
| Audit logs for major actions | ✅ done (minor additions) |
| Users receive in-app notifications | ✅ done (wire remaining triggers) |

**Bottom line:** The rental + trust spine (KYC, wallet, verification, certificate, lease escrow, audit, notifications) meets the prototype DoD today or with small additions. The two real build items left are **dedicated compliance queues** (Module 7) and the **purchase agreement/escrow path** (Modules 5/6); everything else is polish and production hardening.
