# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Dev server with hot reload (ts-node-dev)
npm run build          # Clean dist/ then compile with tsc
npm start              # Run compiled dist/server.js
npm run typecheck      # tsc --noEmit (src only; tests are type-checked by ts-jest)
npm run lint           # ESLint over src/**/*.ts
npm test               # Jest, runs in band
npm run test:coverage  # Jest with coverage

# Run a single test file or by name
npx jest tests/auth.test.ts
npx jest -t "logs in with valid credentials"
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build; keep all four green.

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
- **Auth:** `authenticate` populates `req.user` (typed via the global Express augmentation in `auth.middleware.ts`); `authorize(...roles)` gates by role. Access/refresh tokens use separate secrets.
- **Logging:** Use the `logger` from `core/utils/logger.ts` (not raw `console`). The HTTP logger redacts a `SENSITIVE_KEYS` list from request bodies — extend that list when adding fields that must never be logged.
- **Lifecycle:** `app.ts` must stay free of side effects (it's imported directly by tests). DB connection and `listen()` live in `server.ts`, which connects before listening and drains HTTP + Mongo on `SIGTERM`/`SIGINT`.

## Testing

Jest + Supertest with `mongodb-memory-server` (no external DB). `tests/env.setup.ts` sets env vars before any app module loads; `tests/setup.ts` spins up the in-memory Mongo and clears collections between tests. Tests import `app` from `src/app.ts` directly and assert over HTTP. Rate limiting is disabled under `NODE_ENV=test` (see `rateLimiter.middleware.ts`).
