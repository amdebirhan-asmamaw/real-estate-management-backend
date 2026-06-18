# Web3 Real Estate Marketplace Backend

A production-shaped backend for a blockchain-enabled real-estate marketplace. It supports the four-role model `SUPER_ADMIN`, `ADMIN`, `PROPERTY_OWNER`, and `TENANT` where tenants are buyers or renters. The API covers property discovery, owner listing workflows, KYC/compliance oversight, offers, purchase transactions, rental applications, leases, ERC-721 property titles, ERC-20 lease/sale escrow, saved-search alerts, audit logs, and operational diagnostics.

## Features

- **TypeScript** with strict compiler settings and path aliases
- **Modular structure** — `core` for shared infrastructure, `modules` for features
- **JWT auth** — access + refresh tokens, password hashing (bcrypt), role-based authorization
- **Validation** — request validation with [Joi](https://joi.dev/) and a reusable `validate` middleware
- **Centralized error handling** — `AppError`, consistent JSON error shapes, mapping for Joi/Mongoose/JWT errors
- **Security** — Helmet, CORS allow-list, rate limiting (general + stricter on auth), `trust proxy`, secret-redacting request logs
- **Config validation** — fail-fast environment variable validation at startup
- **Spatial discovery** — viewport/radius/polygon filtering, map clusters, geocoding, neighborhoods, and analytics
- **Marketplace workflows** — listings, media, ownership documents, favorites, inquiries, offers, purchases, applications, leases, and rental yield
- **Blockchain operations** — title minting/status, lease escrow, sale escrow, chain transaction ledger, and reconciliation worker
- **Compliance and oversight** — KYC review, broker licenses, compliance cases/queues, admin audit logs, and notifications
- **Health checks** — `/health` and expanded `/health/ready` for DB, SMTP, Cloudinary, RPC, contracts, and geocoder config
- **Request correlation** — `x-request-id` propagated to responses, logs, and audit metadata
- **Graceful shutdown** — drains the HTTP server and closes the DB connection on `SIGTERM`/`SIGINT`
- **Testing** — Jest + Supertest with an in-memory MongoDB (no external DB needed)
- **Tooling** — ESLint, Prettier, EditorConfig, husky + lint-staged pre-commit hook
- **Docker** — multi-stage build, non-root runtime, `docker-compose` with MongoDB
- **CI** — GitHub Actions running lint, type-check, test, and build

## Requirements

- Node.js **>= 20** (see [`.nvmrc`](.nvmrc))
- MongoDB (local, Atlas, or via the bundled `docker-compose`)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Create your env file and fill in secrets
cp .env.example .env

# 3. Start the dev server (hot reload)
npm run dev
```

The API is served at `http://localhost:5000/api/v1`.

Generate strong JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Scripts

| Script                  | Description                      |
| ----------------------- | -------------------------------- |
| `npm run dev`           | Start dev server with hot reload |
| `npm run build`         | Compile TypeScript to `dist/`    |
| `npm start`             | Run the compiled server          |
| `npm run typecheck`     | Type-check without emitting      |
| `npm run lint`          | Lint with ESLint                 |
| `npm run lint:fix`      | Lint and auto-fix                |
| `npm run format`        | Format with Prettier             |
| `npm test`              | Run the test suite               |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run reconcile:chain` | One-shot chain transaction reconciliation worker |
| `npm run alerts:saved-searches` | One-shot saved-search alert catch-up worker |

## Environment Variables

Validated at startup in [`src/core/config/env.ts`](src/core/config/env.ts). The process exits with a clear message if any are invalid.

| Variable                 | Required | Default       | Description                                               |
| ------------------------ | -------- | ------------- | --------------------------------------------------------- |
| `NODE_ENV`               | no       | `development` | `development` \| `production` \| `test`                   |
| `PORT`                   | no       | `5000`        | HTTP port                                                 |
| `MONGODB_URI`            | **yes**  | —             | MongoDB connection string                                 |
| `JWT_SECRET`             | **yes**  | —             | Access-token secret (≥ 32 chars)                          |
| `JWT_EXPIRES_IN`         | no       | `7d`          | Access-token lifetime                                     |
| `JWT_REFRESH_SECRET`     | **yes**  | —             | Refresh-token secret (≥ 32 chars, must differ from above) |
| `JWT_REFRESH_EXPIRES_IN` | no       | `30d`         | Refresh-token lifetime                                    |
| `CORS_ORIGIN`            | no       | `*`           | `*` or a comma-separated allow-list of origins            |
| `RATE_LIMIT_WINDOW_MS`   | no       | `900000`      | Rate-limit window (ms)                                    |
| `RATE_LIMIT_MAX`         | no       | `100`         | Max requests per window per IP                            |
| `TRUST_PROXY`            | no       | `0`           | Number of proxies in front of the app                     |
| `CLOUDINARY_CLOUD_NAME`  | no\*     | —             | Cloudinary cloud name (photos + private docs)             |
| `CLOUDINARY_API_KEY`     | no\*     | —             | Cloudinary API key                                        |
| `CLOUDINARY_API_SECRET`  | no\*     | —             | Cloudinary API secret                                     |
| `UPLOAD_MAX_BYTES`       | no       | `5242880`     | Max upload size per file (bytes)                          |
| `BLOCKCHAIN_RPC_URL`     | no†      | —             | EVM RPC (e.g. local Hardhat node)                         |
| `TITLE_CONTRACT_ADDRESS` | no†      | —             | Deployed PropertyTitle contract address                   |
| `MINTER_PRIVATE_KEY`     | no†      | —             | Custodial minter wallet private key                       |
| `ESCROW_CONTRACT_ADDRESS` | no†     | —             | Deployed LeaseEscrow contract address                     |
| `ESCROW_TOKEN_ADDRESS`   | no†      | —             | Allowlisted ERC-20 escrow token                           |
| `SALE_ESCROW_CONTRACT_ADDRESS` | no† | —             | Deployed SaleEscrow contract address                      |
| `ALLOW_MAINNET_ESCROW`   | no       | `false`       | Explicit opt-in for Ethereum mainnet escrow operations    |
| `GEOCODER_PROVIDER`      | no       | `mock`        | `mock` or `nominatim`                                     |
| `NOMINATIM_BASE_URL`     | no       | `https://nominatim.openstreetmap.org` | Nominatim-compatible endpoint        |
| `NOMINATIM_USER_AGENT`   | no       | `real-estate-marketplace/1.0` | Required Nominatim user agent             |
| `GEOCODER_CACHE_TTL_HOURS` | no     | `720`         | Geocoding cache TTL                                       |
| `APP_BASE_URL`           | no       | `http://localhost:3000` | Frontend URL used in password reset links          |
| `MAIL_FROM`              | no       | `Swafri <no-reply@swafri.local>` | From address for auth emails           |
| `SMTP_HOST`              | no‡      | —             | SMTP host for email delivery                              |
| `SMTP_PORT`              | no       | `587`         | SMTP port                                                 |
| `SMTP_SECURE`            | no       | `false`       | Use TLS for SMTP connection                               |
| `SMTP_USER`              | no       | —             | SMTP username                                             |
| `SMTP_PASS`              | no       | —             | SMTP password                                             |
| `PASSWORD_RESET_EXPIRES_MINUTES` | no | `30`       | Password reset token lifetime                             |

\* Optional to boot, but uploads fail fast with `503` until Cloudinary is configured.
† Optional to boot; on-chain title minting/verification fails fast with `503` until configured. The `PropertyTitle` contract lives in the separate `real-estate-contracts` repo — see [docs/prd/increment-2-onchain-titles.md](docs/prd/increment-2-onchain-titles.md).
‡ Optional outside production; when SMTP is missing locally, reset links are written to the dev logger instead of sent.

## Project Structure

```
src/
├── app.ts                 # Express app: middleware, routes, error handlers
├── server.ts              # Bootstrap: connect DB, listen, graceful shutdown
├── index.routes.ts        # Mounts feature module routers under /api/v1
├── core/
│   ├── config/            # env validation, database connection
│   ├── middleware/        # auth, validation, error, rate limiter, logging
│   └── utils/             # AppError, jwt, logger, response helpers
└── modules/
    └── auth/              # Example feature module
        ├── auth.controller.ts
        ├── auth.service.ts
        ├── auth.model.ts
        ├── auth.routes.ts
        └── auth.validation.ts
tests/                     # Jest + Supertest integration tests
```

## API

**Interactive docs:** Swagger UI at `GET /api/docs`, raw OpenAPI at `GET /api/docs.json`.
**Frontend integration guide:** [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md).

Base URL: `/api/v1`

**Auth**

| Method | Endpoint              | Auth | Description                                          |
| ------ | --------------------- | ---- | ---------------------------------------------------- |
| POST   | `/auth/register`      | —    | Create an account (role: `property_owner`\|`tenant`) |
| POST   | `/auth/login`         | —    | Log in, returns tokens                               |
| POST   | `/auth/refresh-token` | —    | Exchange + rotate a refresh token                    |
| POST   | `/auth/logout`        | —    | Revoke one refresh-token session                     |
| POST   | `/auth/forgot-password` | —  | Send password reset instructions if the email exists |
| POST   | `/auth/reset-password` | —   | Reset password with emailed token                    |
| POST   | `/auth/logout-all`    | ✅   | Revoke all of the caller's sessions                  |
| GET    | `/auth/sessions`      | ✅   | List the caller's active sessions                    |
| POST   | `/auth/change-password` | ✅ | Change password (revokes all sessions)               |
| GET    | `/auth/me`            | ✅   | Current user's profile                               |
| PATCH  | `/auth/me`            | ✅   | Update profile fields (`name`, `walletAddress`)      |

Refresh tokens are stored hashed and **rotate** on every refresh; reusing a rotated token revokes the whole session family. Keep access tokens short-lived (`JWT_EXPIRES_IN`, e.g. `15m`).

Property owners register as `pending` and must pass KYC before they can submit a listing; tenants are `active` immediately.

**KYC & account management**

| Method | Endpoint                                  | Auth  | Description                          |
| ------ | ----------------------------------------- | ----- | ------------------------------------ |
| POST   | `/kyc/documents`                          | user  | Submit private KYC documents         |
| GET    | `/kyc/me`                                 | user  | Own KYC status + documents           |
| GET    | `/kyc/documents/:docId/url`               | user  | Signed URL for own KYC document      |
| PATCH  | `/admin/users/:id/status`                 | admin | Set a user's account status          |
| GET    | `/admin/users/:id/kyc`                    | admin | A user's KYC status + documents      |
| POST   | `/admin/users/:id/kyc/review`             | admin | Approve / reject a user's KYC         |
| GET    | `/admin/users/:id/kyc/documents/:docId/url` | admin | Signed URL for a user's KYC document |

**Listings** (real-estate marketplace — Increment 1)

| Method | Endpoint                              | Auth          | Description                                  |
| ------ | ------------------------------------- | ------------- | -------------------------------------------- |
| GET    | `/listings`                           | public        | Discovery: viewport/radius + filters         |
| GET    | `/listings/:id`                       | optional      | Get published, or own/admin                  |
| GET    | `/listings/mine`                      | owner         | Caller's listings (any status)               |
| POST   | `/listings`                           | owner/admin   | Create a draft                               |
| PATCH  | `/listings/:id`                       | owner/admin   | Edit (draft/rejected only for owners)        |
| DELETE | `/listings/:id`                       | owner/admin   | Delete                                       |
| POST   | `/listings/:id/transition`            | owner/admin   | Review workflow (submit/approve/publish/…)   |
| POST   | `/listings/:id/photos`                | owner/admin   | Upload public photos (multipart)             |
| DELETE | `/listings/:id/photos`                | owner/admin   | Remove a photo                               |
| POST   | `/listings/:id/documents`             | owner/admin   | Upload private ownership docs (multipart)    |
| GET    | `/listings/:id/documents`             | owner/admin   | List document metadata                       |
| GET    | `/listings/:id/documents/:docId/url`  | owner/admin   | Mint a signed URL for a private document     |
| POST   | `/listings/:id/documents/:docId/review` | admin       | Approve/reject a document                    |
| GET    | `/listings/:id/duplicates`            | admin         | Non-blocking duplicate warnings              |
| POST   | `/listings/:id/mint-title`            | admin         | Mint the on-chain digital title (verified)   |
| GET    | `/listings/:id/title`                 | optional      | On-chain ownership verification              |
| GET    | `/admin/listings`                     | admin         | Review queue (filter by status)              |
| GET    | `/audit-logs`                         | admin         | Query the lifecycle audit trail              |

Owners create drafts and **submit** for review; **only admins publish**. See [docs/prd/increment-1-marketplace-core.md](docs/prd/increment-1-marketplace-core.md) for the full workflow.

**Spatial discovery and owner yield**

| Method | Endpoint | Auth | Description |
| ------ | -------- | ---- | ----------- |
| GET | `/geo/geocode?q=...` | public | Geocode with cache (`mock` or Nominatim-compatible provider) |
| GET | `/geo/reverse?lat=...&lng=...` | public | Reverse geocode coordinates |
| GET | `/geo/neighborhoods` | public | List local neighborhood datasets |
| GET | `/geo/neighborhoods/:id/analytics` | public | Listing, rent/price, POI, and lead analytics |
| GET | `/listings/clusters` | public | Map clusters for dense viewport rendering |
| POST | `/listings/:id/maintenance-records` | owner/admin | Record maintenance, repair, tax, utility, or other costs |
| GET | `/listings/:id/maintenance-records` | owner/admin | List listing costs |
| GET | `/listings/:id/yield` | owner/admin | Gross rent, occupancy, escrow history, net and annualized yield |
| GET | `/leases/:id/timeline` | party/admin | Tenant/owner-visible lease and escrow timeline |

**Favorites & Inquiries** (Increment 1.5)

| Method | Endpoint                  | Auth        | Description                          |
| ------ | ------------------------- | ----------- | ------------------------------------ |
| GET    | `/favorites`              | user        | List saved listings                  |
| POST   | `/favorites`              | user        | Save a listing (`{ listingId }`)     |
| DELETE | `/favorites/:listingId`   | user        | Unsave a listing                     |
| POST   | `/inquiries`              | user        | Send an inquiry (`{ listingId, message }`) |
| GET    | `/inquiries/mine`         | user        | Inquiries the caller sent            |
| GET    | `/inquiries/received`     | user        | Inquiries on the caller's listings   |
| PATCH  | `/inquiries/:id`          | owner/admin | Respond / update status              |

See [docs/prd/increment-1.5-favorites-inquiries.md](docs/prd/increment-1.5-favorites-inquiries.md).

Plus `GET /health` and `GET /health/ready` at the root. Readiness reports database, SMTP config, Cloudinary config, RPC provider reachability, title contract config, lease escrow config, sale escrow config, and geocoder adapter status.

**Operational workers**

```bash
# Reconcile pending/mined chain transactions against the configured RPC.
npm run reconcile:chain -- --confirmations=2

# Catch up saved-search alerts for recently published/updated listings.
npm run alerts:saved-searches -- --sinceMinutes=60 --limit=100
```

Both workers are one-shot entrypoints designed for cron, Kubernetes CronJobs, or an external queue scheduler.

All responses follow a consistent envelope:

```jsonc
// Success
{ "success": true, "message": "...", "data": { /* ... */ } }
// Error
{ "success": false, "message": "...", "errors": [ /* optional */ ] }
```

## Adding a Feature Module

1. Create `src/modules/<name>/` with `*.routes.ts`, `*.controller.ts`, `*.service.ts`, and (if it has data) `*.model.ts` and `*.validation.ts`.
2. Keep HTTP concerns in the controller, business logic in the service, and DB access in the model.
3. Throw `AppError` for expected failures; the error middleware turns it into a clean response.
4. Mount the router in [`src/index.routes.ts`](src/index.routes.ts):

```ts
import { widgetRouter } from "./modules/widget/widget.routes";
router.use("/widgets", widgetRouter);
```

## Testing

Tests use an in-memory MongoDB ([`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)), so no database setup is required.

```bash
npm test
npm run test:coverage
```

## Docker

```bash
# Provide secrets, then bring up the API + MongoDB
export JWT_SECRET=... JWT_REFRESH_SECRET=...
docker compose up --build
```

The image is a multi-stage build that runs as a non-root user and includes a container health check.

## License

[MIT](LICENSE)
