import { connectDatabase, disconnectDatabase } from "../core/config/database";
import { logger } from "../core/utils/logger";
import { reconcilePending } from "../modules/chainTransactions/reconcile.job";

const numberArg = (name: string, fallback: number): number => {
  const prefix = `--${name}=`;
  const raw = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const run = async (): Promise<void> => {
  await connectDatabase();
  try {
    const confirmations = numberArg("confirmations", 1);
    const summary = await reconcilePending({ confirmations });
    logger.info(`chain reconciliation complete: ${JSON.stringify(summary)}`);
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error) => {
  logger.error("chain reconciliation failed", error);
  process.exit(1);
});
