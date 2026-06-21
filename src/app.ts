import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { env } from "./core/config/env";
import { openapiSpec } from "./core/docs/openapi";
import { errorHandler } from "./core/middleware/error.middleware";
import { notFoundHandler } from "./core/middleware/notFound.middleware";
import { httpLogger } from "./core/middleware/httpLogger.middleware";
import { requestId } from "./core/middleware/requestId.middleware";
import { getReadiness } from "./core/health/readiness";
import apiRouter from "./index.routes";

const app = express();

// ─── Proxy ────────────────────────────────────────────────────────────────────
// Required for correct client IPs and rate limiting behind a reverse proxy/LB.
if (env.TRUST_PROXY > 0) {
  app.set("trust proxy", env.TRUST_PROXY);
}

// ─── Security & Parsing ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    // Empty corsOrigins => reflect any origin ("*"); otherwise allow-list.
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);

// ─── Logging ────────────────────────────────────────────────────────────────────
if (!env.isTest) {
  app.use(morgan(env.isDevelopment ? "dev" : "combined"));
  app.use(httpLogger);
}

// ─── Health Checks ──────────────────────────────────────────────────────────────
// Liveness: process is up.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Readiness: dependencies (DB) are reachable. Used by orchestrators to decide
// whether to route traffic to this instance.
app.get("/health/ready", async (_req, res, next) => {
  try {
    const report = await getReadiness();
    res.status(report.status === "ready" ? 200 : 503).json(report);
  } catch (error) {
    next(error);
  }
});

// ─── API Docs (Swagger UI) ──────────────────────────────────────────────────────
// Mounted before the rate limiter so the docs assets aren't throttled.
app.get("/api/v1/docs.json", (_req, res) => res.json(openapiSpec));
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1", apiRouter);

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
