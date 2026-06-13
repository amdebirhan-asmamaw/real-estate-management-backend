# Express Project Template

A production-ready backend template built with **Express 4**, **TypeScript**, and **MongoDB (Mongoose)**. It ships with JWT authentication, request validation, structured error handling, security hardening, tests, Docker, and CI so you can start building features instead of plumbing.

## Features

- **TypeScript** with strict compiler settings and path aliases
- **Modular structure** — `core` for shared infrastructure, `modules` for features
- **JWT auth** — access + refresh tokens, password hashing (bcrypt), role-based authorization
- **Validation** — request validation with [Joi](https://joi.dev/) and a reusable `validate` middleware
- **Centralized error handling** — `AppError`, consistent JSON error shapes, mapping for Joi/Mongoose/JWT errors
- **Security** — Helmet, CORS allow-list, rate limiting (general + stricter on auth), `trust proxy`, secret-redacting request logs
- **Config validation** — fail-fast environment variable validation at startup
- **Health checks** — `/health` (liveness) and `/health/ready` (readiness, checks the DB)
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

Base URL: `/api/v1`

| Method | Endpoint              | Auth | Description                       |
| ------ | --------------------- | ---- | --------------------------------- |
| POST   | `/auth/register`      | —    | Create an account, returns tokens |
| POST   | `/auth/login`         | —    | Log in, returns tokens            |
| POST   | `/auth/refresh-token` | —    | Exchange a refresh token          |
| GET    | `/auth/me`            | ✅   | Current user's profile            |

Plus `GET /health` and `GET /health/ready` at the root.

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
