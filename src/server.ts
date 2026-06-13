import type { Server } from "http";
import app from "./app";
import { env } from "./core/config/env";
import { connectDatabase, disconnectDatabase } from "./core/config/database";
import { logger } from "./core/utils/logger";

let server: Server;

const start = async (): Promise<void> => {
  try {
    await connectDatabase();
  } catch (error) {
    logger.error("Failed to connect to the database. Exiting.", error);
    process.exit(1);
  }

  server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections, then drain dependencies.
  const closeServer = new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      logger.info("HTTP server closed.");
      resolve();
    });
  });

  // Force exit if shutdown hangs (e.g. lingering keep-alive connections).
  const forceTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);
  forceTimeout.unref();

  try {
    await closeServer;
    await disconnectDatabase();
    clearTimeout(forceTimeout);
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ─── Unhandled Errors ─────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
  void shutdown("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  void shutdown("uncaughtException");
});

void start();

export default app;
