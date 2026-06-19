import { connectDatabase, disconnectDatabase } from "../core/config/database";
import { logger } from "../core/utils/logger";
import { runSavedSearchAlerts } from "../modules/savedSearches/savedSearch.service";

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
    const sinceMinutes = numberArg("sinceMinutes", 60);
    const limit = numberArg("limit", 100);
    const since = new Date(Date.now() - sinceMinutes * 60_000);
    const summary = await runSavedSearchAlerts({ since, limit });
    logger.info(`saved-search alert run complete: ${JSON.stringify(summary)}`);
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error) => {
  logger.error("saved-search alert run failed", error);
  process.exit(1);
});
