import type { Server } from "http";
import app from "./app";
import { env } from "./core/config/env";
import { connectDatabase, disconnectDatabase } from "./core/config/database";
import { logger } from "./core/utils/logger";
import { reconcilePending } from "./modules/chainTransactions/reconcile.job";

let server: Server;
// Handle returned by setInterval for the reconciliation job. Kept module-level
// so shutdown() can clearInterval on it.
let reconcileHandle: ReturnType<typeof setInterval> | undefined;

/**
 * Emit a visible warning when the server starts in production with a raw
 * MINTER_PRIVATE_KEY env var.  Using a plain private key in production is a
 * security risk — a managed signer (KMS, HSM, or an external signing service)
 * should be used instead.  See docs/SECURITY.md §1 for the upgrade path.
 *
 * This is advisory-only: it does not crash the server.
 */
const warnIfRawPrivateKeyInProduction = (): void => {
  if (env.isProduction && env.MINTER_PRIVATE_KEY) {
    logger.warn(
      "SECURITY WARNING: MINTER_PRIVATE_KEY is set as a raw private key in " +
        "production. This is a high-value secret — consider replacing it with " +
        "a managed signer (AWS KMS, GCP KMS, HashiCorp Vault, or HSM). " +
        "See docs/SECURITY.md for the recommended upgrade path.",
    );
  }
};

const start = async (): Promise<void> => {
  warnIfRawPrivateKeyInProduction();

  try {
    await connectDatabase();
  } catch (error) {
    logger.error("Failed to connect to the database. Exiting.", error);
    process.exit(1);
  }

  server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`,
    );
  });

  // ── Reconciliation job ───────────────────────────────────────────────────
  // Only start if RECONCILE_INTERVAL_MS > 0 AND the chain is configured.
  // Default is 0 (disabled) so tests and staging environments are unaffected.
  // Alternative: use a dedicated cron entrypoint instead of this in-process
  // scheduler — see the example in reconcile.job.ts header comments.
  if (env.RECONCILE_INTERVAL_MS > 0 && env.BLOCKCHAIN_RPC_URL) {
    logger.info(
      `Chain reconciliation job scheduled every ${env.RECONCILE_INTERVAL_MS} ms`,
    );
    reconcileHandle = setInterval(() => {
      reconcilePending().catch((err: unknown) => {
        logger.error("reconcile.job: unexpected error in scheduled run", err);
      });
    }, env.RECONCILE_INTERVAL_MS);
    // Unref so the interval doesn't prevent graceful shutdown from completing
    // if the process would otherwise exit cleanly.
    reconcileHandle.unref();
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Stop the reconciliation interval before closing the server so no new
  // reconcile runs are triggered after we start draining.
  if (reconcileHandle !== undefined) {
    clearInterval(reconcileHandle);
    reconcileHandle = undefined;
  }

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
