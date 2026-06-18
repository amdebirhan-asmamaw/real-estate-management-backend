# Blockchain Deployment Runbook

This backend expects the companion contracts repo at `D:\PROJECTS\real-estate-contracts`.

## Contracts

Contracts used by the backend:

- `PropertyTitle`: ERC-721 property title certificate anchoring `listingId` and document hash.
- `LeaseEscrow`: ERC-20 lease rent/deposit escrow with operator, pause, and token allowlist controls.
- `SaleEscrow`: ERC-20 purchase escrow with operator, pause, and token allowlist controls.

## Local Or Testnet Deployment

From the contracts repo:

```bash
cd D:\PROJECTS\real-estate-contracts
npm ci
npm run compile
npm test
npm run deploy -- --network <network>
npm run export-abi
```

After deployment:

1. Copy contract addresses into backend environment variables:
   - `TITLE_CONTRACT_ADDRESS`
   - `ESCROW_CONTRACT_ADDRESS`
   - `SALE_ESCROW_CONTRACT_ADDRESS`
   - `ESCROW_TOKEN_ADDRESS`
2. Configure `BLOCKCHAIN_RPC_URL`.
3. Configure the backend signer through `MINTER_PRIVATE_KEY` for prototype deployments.
4. Confirm deployed escrow contracts allowlist `ESCROW_TOKEN_ADDRESS`.
5. Confirm the backend signer has title, lease escrow, and sale escrow operator roles.
6. Start the backend and check `GET /health/ready`.

## ABI Parity

Whenever contracts change:

1. Run `npm run export-abi` in the contracts repo.
2. Update backend ABI copies in `src/core/blockchain/*.abi.ts`.
3. Confirm method signatures used by backend services still match:
   - title mint/dispute/clear/revoke/read
   - lease `openAndFund`, `activate`, `cancel`, `releaseDeposit`, `refundDeposit`, `getEscrow`
   - sale `openAndFund`, `release`, `refund`, `getEscrow`
4. Run backend typecheck and focused blockchain tests.

## Reconciliation

Run:

```bash
npm run reconcile:chain -- --confirmations=2
```

This updates pending/mined chain transactions to confirmed, reconciled, reverted, or stale based on RPC receipts.

## Mainnet Checklist

Before enabling `ALLOW_MAINNET_ESCROW=true`:

- Replace raw `MINTER_PRIVATE_KEY` custody with KMS, Vault, HSM, or managed signing.
- Use a multisig/cold owner wallet for contract ownership.
- Keep the application signer limited to operator roles.
- Verify token allowlists on both escrow contracts.
- Verify contracts on the target explorer.
- Run a funded test transaction on the same network using a small amount.
- Confirm rollback and incident communication procedures.
