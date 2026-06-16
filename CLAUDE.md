# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Dev server with hot reload (ts-node-dev)
npm run build          # Clean dist/ then compile with tsc
npm start              # Run compiled dist/server.js
npm run typecheck      # tsc --noEmit (src only; tests are type-checked by ts-jest)
npm run lint           # ESLint over src/**/*.ts
npm run lint:fix       # ESLint with --fix
npm run format         # Prettier --write over src/**/*.ts (format:check to verify only)
npm test               # Jest, runs in band
npm run test:coverage  # Jest with coverage

# Run a single test file or by name
npx jest tests/auth.test.ts
npx jest -t "logs in with valid credentials"
```

Requires Node >= 20. CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build; keep all four green. Husky + `lint-staged` run `eslint --fix` and `prettier --write` on staged `src/**/*.ts` at commit time, so commits are auto-formatted.

## Architecture

Express 4 + TypeScript + MongoDB (Mongoose) REST API, intended as a clonable template. Two-layer source layout:

- **`src/core/`** — shared infrastructure: config, middleware, utils. Feature-agnostic.
- **`src/modules/<name>/`** — vertical feature slices. `auth` is the reference module.

**Request flow:** `server.ts` (bootstrap) → `app.ts` (middleware chain + mounts `index.routes.ts` at `/api/v1`) → module router → `validate` middleware → controller → service → Mongoose model. Errors thrown anywhere bubble to the centralized `error.middleware.ts`.

**Module layering is enforced by convention, not tooling — preserve it:**
- `*.routes.ts` — wires middleware + controller; applies `validate(schema)` and `authenticate`/`authorize`.
- `*.controller.ts` — HTTP only. Wraps service calls in try/catch and forwards errors via `next(error)`. Uses `sendSuccess`/`sendCreated` from `core/utils/response.ts` for the response envelope.
- `*.service.ts` — business logic. Throws `AppError` for expected failures (never sends responses).
- `*.model.ts` — Mongoose schema/model.
- `*.validation.ts` — Joi schemas **and** the exported input types consumed by the controller/service.

**Adding a module:** create the files above under `src/modules/<name>/`, then mount its router in `src/index.routes.ts`.

## Key cross-cutting conventions

- **Error handling:** Throw `AppError(message, statusCode, errors?)` for anything client-facing. `error.middleware.ts` is the single place that translates `AppError`, Joi errors, Mongoose duplicate-key (`11000`) / `ValidationError` / `CastError`, and JWT errors into the standard envelope. Add new error-type mappings there, not in controllers.
- **Response envelope:** Always `{ success, message, data? }` / `{ success, message, errors? }`. Go through `core/utils/response.ts`.
- **Config:** All env access goes through `core/config/env.ts`, which validates at startup with Joi and exits on failure. Add a new variable to the Joi schema **and** the `Env` interface there. Use `env.isProduction` / `env.isTest` / `env.corsOrigins` rather than re-reading `process.env`.
- **Auth:** `authenticate` populates `req.user` (typed via the global Express augmentation in `auth.middleware.ts`); `authorize(...roles)` gates by role. Access/refresh tokens use separate secrets, and every issued token gets a unique `jti` (so rotated tokens never collide).
- **Sessions:** refresh tokens are backed by a `RefreshSession` store (`session.model.ts`) keyed by the token's sha-256 hash with a rotation `family`. Register/login persist a session; `/auth/refresh-token` rotates (revokes the old, issues a new in the same family) and **revokes the whole family on reuse** of a rotated token. `/auth/logout`, `/auth/logout-all`, `/auth/sessions`, and `/auth/change-password` (revokes all sessions) live in `auth.service.ts`. Access tokens stay short-lived/stateless; revocation is enforced at refresh time.
- **Logging:** Use the `logger` from `core/utils/logger.ts` (not raw `console`). The HTTP logger redacts a `SENSITIVE_KEYS` list from request bodies — extend that list when adding fields that must never be logged.
- **Lifecycle:** `app.ts` must stay free of side effects (it's imported directly by tests). DB connection and `listen()` live in `server.ts`, which connects before listening and drains HTTP + Mongo on `SIGTERM`/`SIGINT`.
- **API docs:** a hand-curated OpenAPI 3 spec lives in `src/core/docs/openapi.ts`, served via `swagger-ui-express` at `/api/docs` (+ raw JSON at `/api/docs.json`), mounted before the rate limiter. When you add or change an endpoint, update that spec; the frontend guide is `docs/FRONTEND_GUIDE.md`.

## Domain: real-estate marketplace (Increment 1)

This is the backend for a verified, decentralized real-estate platform, built incrementally. Increment 1 (shipped) is the off-chain marketplace core; blockchain/title minting is a later increment. See `docs/prd/increment-1-marketplace-core.md`.

- **Roles** (`auth.model.ts`): `super_admin`, `admin`, `property_owner`, `tenant`. Self-registration is limited to `property_owner`/`tenant` (enforced in `auth.validation.ts`); admins are provisioned out-of-band. `super_admin` == `admin` for authorization today.
- **Account lifecycle & KYC** (`auth.model.ts`, `src/modules/kyc/`): users have `accountStatus` (`pending|active|suspended|blocked|rejected`) and `kycStatus` (`not_started|pending|verified|rejected`). Property owners default to `pending`, others to `active` (role-based default in a `pre('validate')` hook). `canAuthenticate(status)` gates login/refresh (suspended/blocked/rejected denied). A property_owner **cannot `submit` a listing until `accountStatus === active`** (checked in `transition`). KYC docs are private (Cloudinary `authenticated` + sha-256), stripped from user JSON, served via signed URLs; admin review approves→verified+active or rejects. Admins set status via `/admin/users/:id/status`. `walletAddress`/`walletStatus`/`emailVerified` are groundwork.
- **Listings** (`src/modules/listings/`): the `listing.service.ts` holds CRUD, the review **state machine** (`transition`), geospatial `discover`, photos, and private documents. Geolocation is a GeoJSON `Point` with a `2dsphere` index; discovery uses `$geoWithin/$box` (viewport) and `$near` (radius). `countDocuments` rejects `$near`, so radius counts strip the geo clause.
- **Review workflow:** owners create drafts and `submit`; **only admins publish**. Statuses: `draft → submitted → under_review → approved → published` (+ `rejected`, `suspended`, `archived`). Transitions are a table in `listing.service.ts` (`TRANSITIONS`) keyed by action, each with allowed `from` states, actor (`owner_or_admin`/`admin_only`), and audit action. Add new transitions there, not in controllers.
- **Publish requires verified ownership:** the `publish` transition has an extra guard (in `transition`) — it refuses unless `verificationStatus === "verified"`, `ownershipDocumentHash` is set, and at least one `title_deed` document is `approved`. This is the platform's core trust rule; keep it.
- **Listing document types are property-only:** `title_deed`, `tax_record`, `utility_bill`, `ownership_certificate`, `other`. Identity (`id`/passport) is a KYC artifact and is intentionally NOT a listing document type.
- **Private documents:** ownership docs upload to Cloudinary as `authenticated` (private) resources via `uploadPrivate` and are sha-256 hashed (`core/utils/hash.ts`) for future on-chain anchoring. They are **never** in a listing's JSON (model `toJSON` deletes `documents`); access is only via the authz-gated signed-URL endpoint. Photos are public (`uploadPublic`).
- **Photo deletion order:** remove from the listing in the DB first, then destroy the remote asset (`controller.removePhoto`) — never destroy before permission + existence are confirmed.
- **Blockchain-ready fields** on `Listing` (`verificationStatus`, `verifiedBy`, `ownershipDocumentHash`, `blockchainTxHash`, `tokenId`, …) are populated now only as far as verification; the rest await Increment 2.
- **Audit log** (`src/modules/audit/`): every lifecycle transition and document review writes a queryable `AuditLog` entry via best-effort `record()` (failures never break the business op).
- **Uploader is mockable:** tests `jest.mock("../src/core/utils/uploader", …)` to avoid real Cloudinary calls.
- **Favorites & inquiries** (`src/modules/favorites`, `src/modules/inquiries`, Increment 1.5): any authenticated user saves/unsaves listings (unique `(user, listing)`) and sends inquiries; both reuse `listing.service.getListingById` to enforce published-only visibility. Inquiries denormalize `listingOwner`; only that owner or an admin may respond/update.
- **On-chain titles** (`src/core/blockchain/`, Increment 2): `propertyTitle.service.ts` (ethers v6) mints/reads a `PropertyTitle` ERC-721. `listing.service.mintTitle` is an admin-only, mint-once action requiring a verified listing; it records `tokenId`/`contractAddress`/`blockchainTxHash`/`titleCertificateId` and audits `listing.title_minted`. `getTitleInfo` compares the on-chain hash to `ownershipDocumentHash`. Minting is **custodial** (platform wallet) for now. The contract lives in the separate `real-estate-contracts` Hardhat repo (scaffolded: `PropertyTitle.sol`, tests, deploy + `export-abi`); `propertyTitle.abi.ts` is parity-matched with its compiled ABI. Chain env (`BLOCKCHAIN_RPC_URL`, `TITLE_CONTRACT_ADDRESS`, `MINTER_PRIVATE_KEY`) is optional; the service is mocked in tests like the uploader. The lease flow calls the escrow chain before persisting state; a reconciliation job that reads on-chain escrow state via getEscrow is future work.

## Lease escrow flow (backend wiring)

1. **Deploy contracts** — in the `real-estate-contracts` Hardhat repo run `npm run deploy:local`. Note the `leaseEscrow` and `mockToken` addresses written to `deployments/localhost.json`.
2. **Backend `.env`** — add `ESCROW_CONTRACT_ADDRESS=<leaseEscrow>` and `ESCROW_TOKEN_ADDRESS=<mockToken>` alongside the existing `BLOCKCHAIN_RPC_URL` and `MINTER_PRIVATE_KEY` vars (the custodial minter wallet is reused).
3. **Operational precondition** — the custodial wallet must hold enough stablecoin and have approved the escrow contract before any `/fund` call. For local demos: call `MockERC20.mint(<minterAddress>, amount)` then `MockERC20.approve(<escrowAddress>, amount)` (e.g. via `npx hardhat console --network localhost`).
4. **Endpoint flow** — `POST /leases` → `POST /leases/{id}/propose` → (admin) `POST /leases/{id}/fund` → `POST /leases/{id}/activate` → `POST /leases/{id}/complete` or `POST /leases/{id}/terminate`. Disputes: `POST /leases/{id}/dispute` then `POST /leases/{id}/dispute/resolve`. Both parties must have a linked `walletAddress` on their user record before `/fund` is called.

## Testing

Jest + Supertest with `mongodb-memory-server` (no external DB). `tests/env.setup.ts` sets env vars before any app module loads; `tests/setup.ts` spins up the in-memory Mongo and clears collections between tests. Tests import `app` from `src/app.ts` directly and assert over HTTP. Rate limiting is disabled under `NODE_ENV=test` (see `rateLimiter.middleware.ts`).
