import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import mongoose from "mongoose";

import { env } from "./core/config/env";
import { errorHandler } from "./core/middleware/error.middleware";
import { notFoundHandler } from "./core/middleware/notFound.middleware";
import { httpLogger } from "./core/middleware/httpLogger.middleware";
import { apiLimiter } from "./core/middleware/rateLimiter.middleware";
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
app.get("/health/ready", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not ready",
    services: { database: dbReady ? "up" : "down" },
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api", apiLimiter);
app.use("/api/v1", apiRouter);

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
