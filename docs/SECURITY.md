# Security & Custody Posture

This document covers the custody model, key management, access-control
split, mainnet safeguards, and operational trade-offs that engineers and
operators need to understand before deploying to production.

---

## 1. Custodial hot-wallet model

All on-chain transactions — property title minting, lease escrow funding,
and sale escrow funding — are signed by a single platform wallet whose
private key is supplied via `MINTER_PRIVATE_KEY`.

**What the wallet signs:**

| Operation | Contract |
|-----------|----------|
| `mintTitle` | `PropertyTitle` |
| `openAndFund` | `LeaseEscrow` |
| `activate / cancel / releaseDeposit / refundDeposit` | `LeaseEscrow` |
| `openAndFund / release / refund` | `SaleEscrow` |

Because this wallet controls all fund movements it is a high-value target.
In production it **must not** be a plain environment-variable private key.

**Recommended upgrade path (choose one):**

- **AWS KMS / GCP KMS / Azure Key Vault** — the private key never leaves
  the HSM; transactions are signed via the cloud SDK.  Use the
  `@aws-sdk/client-kms` + an ethers.js custom signer, or an equivalent
  wrapper.
- **HashiCorp Vault Transit** — key stored in Vault; sign operations go
  through the Vault API.
- **External signing service** — a dedicated microservice that holds the
  key and exposes a sign-transaction endpoint over mTLS.
- **Hardware Security Module (HSM)** — for on-prem deployments.

A startup warning is logged when `NODE_ENV=production` and a raw
`MINTER_PRIVATE_KEY` is detected (see §6).

**Key rotation:**  The deployer wallet is the `Ownable` owner of
`PropertyTitle` and both escrow contracts.  To rotate:

1. Deploy or choose a new wallet.
2. Call `transferOwnership(newOwner)` on each contract from the old wallet.
3. Grant `TITLE_OPERATOR_ROLE` / `ESCROW_OPERATOR_ROLE` on the new wallet
   (see §2).
4. Revoke the old wallet's roles.
5. Update `MINTER_PRIVATE_KEY` in all environments.

---

## 2. Contracts' two-tier access control

Both `PropertyTitle` and `LeaseEscrow` / `SaleEscrow` use a two-tier model:

| Tier | Who | What |
|------|-----|-------|
| **Owner** (`Ownable`) | Admin wallet | `setTitleOperator`, `setEscrowOperator`, `setTokenAllowed`, `pause`/`unpause`, `setBaseURI`, `transferOwnership` |
| **Operator** (`TITLE_OPERATOR_ROLE` / `ESCROW_OPERATOR_ROLE`) | Day-to-day platform wallet | `mintTitle`, `markDisputed`, `clearDispute`, `revokeTitle`, `openAndFund`, `activate`, `cancel`, `releaseDeposit`, `refundDeposit` |

At deploy time the deployer wallet holds **both** roles.

**Recommended production split:**

- The **owner** wallet should be a multi-sig (e.g. Gnosis Safe) or a cold
  wallet that requires an out-of-band approval process.  It is used
  infrequently (only for admin actions) and should never be exposed in
  application environment variables.
- The **operator** wallet is the hot wallet tied to `MINTER_PRIVATE_KEY`.
  It performs day-to-day operations but cannot transfer ownership or
  allowlist arbitrary tokens.

Splitting the roles limits the blast radius: a compromised operator key
cannot transfer contract ownership or change the token allowlist.

---

## 3. Testnet-only escrow stance

All money-moving escrow service methods check the provider's `chainId` at
first use. If the chain is **Ethereum mainnet (chainId 1)** and
`ALLOW_MAINNET_ESCROW` is not `true`, the call throws a 403 `AppError`
before any transaction is sent. This includes `openAndFund`, settlement,
release, refund, cancellation, and activation operations.

**Purpose:** prevent accidental real-money fund moves in staging or
misconfigured environments where `BLOCKCHAIN_RPC_URL` is accidentally
pointed at mainnet.

**To enable mainnet (proceed with caution):**

```
ALLOW_MAINNET_ESCROW=true
```

Set this **only** in the production environment after full operational
review.  Never set it in development, staging, or CI.

The `chainId` is cached after first read so the guard does not add a
network round-trip to subsequent calls.

---

## 4. "Not legal title" disclaimer policy

Minting a `PropertyTitle` NFT **does not** constitute legal property
ownership under any jurisdiction.  The token is a digital record of a
verified listing on this platform only.  All legal property transfers must
go through the applicable government land registry and comply with local
law.  This platform is not a substitute for legal conveyancing.

Any user-facing text, contracts of service, and API documentation must
include a prominent disclaimer to this effect.

---

## 5. Chain-before-save consistency trade-off

The escrow and title services call the blockchain **before** persisting the
updated DB state.  This is an intentional design choice: funds are never
lost even if the DB write fails after a mined transaction, because the
on-chain state is authoritative.

The risk is the inverse: a mined transaction whose corresponding DB record
was not updated.  The DB `escrow.state` field guards against re-issuing a
transition (double-fund, double-release, etc.) once the DB is consistent.

**Mitigation — reconciliation job:**

`src/modules/chainTransactions/reconcile.job.ts` exports `reconcilePending()`,
which scans all `ChainTransaction` records in `"pending"` or `"mined"` status
and calls the existing `reconcile()` primitive on each.  Run it on a cron
schedule (e.g. every minute) to close any gaps left by transient DB write
failures or process crashes:

```ts
// scripts/reconcile.cron.ts
import { reconcilePending } from "../src/modules/chainTransactions/reconcile.job";

// Example: run every 60 seconds
setInterval(() => void reconcilePending({ confirmations: 2 }), 60_000);
```

The job returns `{ checked, confirmed, reverted, stale, errors }` and logs
a summary line at `INFO` level.

---

## 6. Secrets handling

- **Never commit private keys.**  `.env` files must be in `.gitignore`.
- `MINTER_PRIVATE_KEY` must never appear in logs, error messages, or API
  responses.  The logger in `src/core/utils/logger.ts` redacts common
  sensitive key names (`secret`, `token`, `apikey`, etc.) from HTTP body
  logs; ensure any new logging paths follow the same pattern.
- Rotate all secrets immediately if a breach is suspected.
- Use separate wallets and separate `BLOCKCHAIN_RPC_URL` values for each
  environment (development, staging, production).
- The `ALLOW_MAINNET_ESCROW` flag is an additional safeguard — it does not
  replace proper secrets management.

**Startup warning:**

When the server starts with `NODE_ENV=production` and a raw
`MINTER_PRIVATE_KEY` is set, a `[WARN]` log line is emitted recommending a
managed signer.  This is advisory and does not prevent startup; it is
intended to surface the risk in production log streams.

---

## 7. Idempotency guard

`chainTransaction.service.begin()` rejects a new `*.open_and_fund`
`ChainTransaction` for any target that already has a non-failed record with
the same operation.  This prevents double-funding races where two concurrent
requests slip past the DB `escrow.state !== "none"` check simultaneously.
The guard complements (not replaces) the application-level state checks in
`lease.service` and `purchaseTransaction.service`.
