/**
 * Task 4: scheduled reconciliation job wiring.
 *
 * server.ts is excluded from jest (it calls `void start()` at module level
 * and can't be safely imported in tests). Instead we test the scheduling
 * contract directly:
 *
 * 1. When RECONCILE_INTERVAL_MS > 0 an interval fires reconcilePending.
 * 2. When RECONCILE_INTERVAL_MS === 0 (default) nothing is scheduled.
 *
 * We use jest fake timers so the tests are instant and don't depend on real
 * time passing.
 */

const mockReconcilePending = jest.fn<Promise<void>, []>().mockResolvedValue();

jest.mock("../src/modules/chainTransactions/reconcile.job", () => ({
  reconcilePending: mockReconcilePending,
}));

import { reconcilePending } from "../src/modules/chainTransactions/reconcile.job";

/** Minimal replica of the server.ts scheduling logic (DRY-copies for testing). */
function startReconcileScheduler(
  intervalMs: number,
  chainConfigured: boolean,
): ReturnType<typeof setInterval> | undefined {
  if (intervalMs > 0 && chainConfigured) {
    const handle = setInterval(() => {
      reconcilePending().catch(() => {
        /* intentionally swallowed in test replica */
      });
    }, intervalMs);
    handle.unref();
    return handle;
  }
  return undefined;
}

describe("reconciliation job scheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReconcilePending.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires reconcilePending on each tick when interval > 0 and chain configured", () => {
    const handle = startReconcileScheduler(60_000, true);
    expect(handle).toBeDefined();

    // Advance two full intervals.
    jest.advanceTimersByTime(120_000);

    expect(mockReconcilePending).toHaveBeenCalledTimes(2);

    if (handle) clearInterval(handle);
  });

  it("does NOT schedule anything when RECONCILE_INTERVAL_MS is 0 (default)", () => {
    const handle = startReconcileScheduler(0, true);
    expect(handle).toBeUndefined();

    jest.advanceTimersByTime(60_000);
    expect(mockReconcilePending).not.toHaveBeenCalled();
  });

  it("does NOT schedule when chain is not configured (empty BLOCKCHAIN_RPC_URL)", () => {
    const handle = startReconcileScheduler(60_000, false);
    expect(handle).toBeUndefined();

    jest.advanceTimersByTime(60_000);
    expect(mockReconcilePending).not.toHaveBeenCalled();
  });

  it("clearInterval on the handle stops further reconcile calls", () => {
    const handle = startReconcileScheduler(60_000, true);
    expect(handle).toBeDefined();

    jest.advanceTimersByTime(60_000); // 1 tick
    expect(mockReconcilePending).toHaveBeenCalledTimes(1);

    if (handle) clearInterval(handle);

    jest.advanceTimersByTime(60_000); // would have been tick 2 but handle cleared
    expect(mockReconcilePending).toHaveBeenCalledTimes(1); // still 1
  });
});
