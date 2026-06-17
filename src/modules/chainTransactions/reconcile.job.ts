/**
 * reconcile.job.ts — batch reconciliation of pending/mined chain transactions.
 *
 * Usage (one-shot, from a script or cron entrypoint):
 *
 *   import { reconcilePending } from "./reconcile.job";
 *   const summary = await reconcilePending({ confirmations: 2 });
 *   console.log(summary);
 *
 * To run on a schedule, wire this into a cron entrypoint such as:
 *
 *   // scripts/reconcile.cron.ts
 *   import cron from "node-cron";            // or any scheduler
 *   import { reconcilePending } from "../src/modules/chainTransactions/reconcile.job";
 *   cron.schedule("* * * * *", () => void reconcilePending({ confirmations: 2 }));
 *
 * This module does NOT import any scheduler itself — keep it pure so it can
 * be called from scripts, workers, or tests without side-effects.
 */

import { ChainTransaction } from "./chainTransaction.model";
import { reconcile as reconcileSingle } from "./chainTransaction.service";
import { logger } from "../../core/utils/logger";

export interface ReconcileOpts {
  /** Minimum on-chain confirmations before a tx is marked "reconciled". Default 1. */
  confirmations?: number;
}

export interface ReconcileSummary {
  checked: number;
  confirmed: number;
  reverted: number;
  stale: number;
  errors: number;
}

/**
 * Query all chainTransactions in "pending" or "mined" status and call the
 * existing `reconcile` primitive on each. Returns a summary of what changed.
 *
 * Design note: we reuse the existing `reconcile(id)` function from
 * chainTransaction.service rather than reimplementing receipt-reading here.
 * That function owns the provider, receipt fetch, confirmation count, and all
 * status transitions — this job is just the loop + aggregation.
 */
export const reconcilePending = async (
  opts: ReconcileOpts = {},
): Promise<ReconcileSummary> => {
  const summary: ReconcileSummary = {
    checked: 0,
    confirmed: 0,
    reverted: 0,
    stale: 0,
    errors: 0,
  };

  // Fetch all pending/mined records. In production with high volume, paginate
  // or use a cursor here; for the current scale a single query is fine.
  const pending = await ChainTransaction.find({
    status: { $in: ["pending", "mined"] },
  }).select("_id txHash status").lean();

  summary.checked = pending.length;

  for (const tx of pending) {
    try {
      const updated = await reconcileSingle(String(tx._id), {
        confirmations: opts.confirmations,
      });

      switch (updated.status) {
        case "reconciled":
        case "confirmed":
          summary.confirmed++;
          break;
        case "reverted":
          summary.reverted++;
          break;
        case "stale":
          summary.stale++;
          break;
        default:
          // status unchanged (e.g. still "confirmed" with fewer than required confs)
          break;
      }
    } catch (err) {
      summary.errors++;
      logger.warn(
        `reconcile.job: failed to reconcile tx ${String(tx._id)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  logger.info(
    `reconcile.job: checked=${summary.checked} confirmed=${summary.confirmed} ` +
      `reverted=${summary.reverted} stale=${summary.stale} errors=${summary.errors}`,
  );

  return summary;
};
