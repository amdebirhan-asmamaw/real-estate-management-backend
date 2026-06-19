# Production Runbook

This runbook covers the backend operational loop for the Web3 Real Estate Marketplace.

## Preflight

- Keep roles limited to `super_admin`, `admin`, `property_owner`, and `tenant`.
- Configure `MONGODB_URI`, JWT secrets, CORS, Cloudinary, SMTP, geocoder, RPC, title, lease escrow, sale escrow, and escrow token variables.
- Use `GEOCODER_PROVIDER=mock` for local/test and `nominatim` only when a valid `NOMINATIM_USER_AGENT` is set.
- Leave `ALLOW_MAINNET_ESCROW=false` outside a reviewed production launch.
- Treat `MINTER_PRIVATE_KEY` as a prototype hot-wallet key. Production should use KMS, Vault, HSM, or managed signing.

## Deploy

1. Run `npm ci`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm test` or the relevant CI test matrix.
5. Run `npm run build`.
6. Start `node dist/server.js` or deploy the Docker image.
7. Confirm `GET /health` returns `200`.
8. Confirm `GET /health/ready` returns `200` and expected service states.

## Readiness

`GET /health/ready` reports:

- `database`
- `smtp`
- `cloudinary`
- `rpcProvider`
- `titleContract`
- `leaseEscrow`
- `saleEscrow`
- `geocoder`

The instance is not ready when MongoDB is down. If `BLOCKCHAIN_RPC_URL` is configured, the RPC provider must also answer within the readiness timeout.

## Scheduled Jobs

Run chain reconciliation on a short cadence:

```bash
npm run reconcile:chain -- --confirmations=2
```

Run saved-search catch-up alerts if immediate publish alerts may be missed by deployments or queue interruptions:

```bash
npm run alerts:saved-searches -- --sinceMinutes=60 --limit=100
```

Saved-search notifications are idempotent per listing and saved search.

## Incident Checks

- Use `x-request-id` from client reports to trace response headers, logs, and audit metadata.
- Check `GET /api/v1/chain-transactions` for pending, stale, reverted, or failed operations.
- Reconcile a single transaction from the admin API when a chain transaction has a tx hash but no final status.
- Inspect audit logs by `targetType`, `targetId`, `actor`, and `action`.
- Keep backups for MongoDB and verify restore procedures before production traffic.

## Production Guardrails

- Do not enable mainnet escrow until contract audits, wallet custody, treasury controls, token allowlists, and incident playbooks are complete.
- Monitor RPC provider latency/error rate, MongoDB health, Cloudinary failures, SMTP delivery failures, and failed chain transactions.
- Rotate JWT secrets and wallet keys through a planned maintenance procedure; do not rotate hot-wallet keys without granting operator roles to the replacement wallet first.
