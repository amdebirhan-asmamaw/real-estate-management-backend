/**
 * D1 tests: reconciliation job + funding idempotency guard.
 *
 * We mock the `reconcile` primitive from chainTransaction.service so the job
 * tests don't need a live RPC node — exactly the pattern used in the existing
 * lease.service tests (mock the chain layer, test the business logic).
 */

// ── Mock reconcile so we can control per-tx outcomes ─────────────────────────
const mockReconcileSingle = jest.fn<
  Promise<{ status: string }>,
  [string, unknown?]
>();

jest.mock("../src/modules/chainTransactions/chainTransaction.service", () => {
  const actual = jest.requireActual(
    "../src/modules/chainTransactions/chainTransaction.service",
  ) as typeof import("../src/modules/chainTransactions/chainTransaction.service");
  return {
    ...actual,
    // Replace only `reconcile`; keep `begin`, `markMined`, etc. real.
    reconcile: mockReconcileSingle,
  };
});

import mongoose from "mongoose";
import {
  ChainTransaction,
} from "../src/modules/chainTransactions/chainTransaction.model";
import { reconcilePending } from "../src/modules/chainTransactions/reconcile.job";
import * as chainTxService from "../src/modules/chainTransactions/chainTransaction.service";

// ── Seed helper ───────────────────────────────────────────────────────────────

const makeChainTx = (
  status: "pending" | "mined" | "failed" | "stale",
  operation: "title.mint" | "lease_escrow.open_and_fund" | "sale_escrow.open_and_fund" = "title.mint",
) =>
  ChainTransaction.create({
    operation,
    status,
    targetType: "listing",
    targetId: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    txHash: "0x" + "a".repeat(64),
  });

// ── reconcilePending job tests ────────────────────────────────────────────────

describe("reconcilePending job", () => {
  beforeEach(() => {
    mockReconcileSingle.mockReset();
  });

  it("calls reconcile for each pending and mined record", async () => {
    const tx1 = await makeChainTx("pending");
    const tx2 = await makeChainTx("mined");
    // A 'failed' tx must NOT be reconciled.
    await makeChainTx("failed");

    mockReconcileSingle.mockResolvedValue({ status: "reconciled" });

    const summary = await reconcilePending({ confirmations: 1 });

    expect(summary.checked).toBe(2);
    expect(mockReconcileSingle).toHaveBeenCalledTimes(2);
    // Called with each pending/mined id (order not guaranteed).
    const calledIds = mockReconcileSingle.mock.calls.map((c) => c[0]);
    expect(calledIds).toContain(tx1.id);
    expect(calledIds).toContain(tx2.id);
  });

  it("counts confirmed, reverted and stale outcomes correctly", async () => {
    await makeChainTx("pending");
    await makeChainTx("mined");
    await makeChainTx("pending");

    mockReconcileSingle
      .mockResolvedValueOnce({ status: "reconciled" })
      .mockResolvedValueOnce({ status: "reverted" })
      .mockResolvedValueOnce({ status: "stale" });

    const summary = await reconcilePending();

    expect(summary.checked).toBe(3);
    expect(summary.confirmed).toBe(1);
    expect(summary.reverted).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("increments errors when reconcile throws and keeps going", async () => {
    await makeChainTx("pending");
    await makeChainTx("pending");

    mockReconcileSingle
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce({ status: "reconciled" });

    const summary = await reconcilePending();

    expect(summary.checked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.confirmed).toBe(1);
  });

  it("returns zeros when there are no pending/mined records", async () => {
    await makeChainTx("failed");
    await makeChainTx("stale");

    const summary = await reconcilePending();

    expect(summary.checked).toBe(0);
    expect(mockReconcileSingle).not.toHaveBeenCalled();
  });
});

// ── Funding idempotency guard (via chainTransaction.service.begin) ────────────

describe("chainTransaction.begin — open_and_fund idempotency", () => {
  const actorId = new mongoose.Types.ObjectId().toString();

  it("allows a first open_and_fund for a target", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();

    // Should not throw.
    const tx = await chainTxService.begin({
      operation: "lease_escrow.open_and_fund",
      targetType: "lease",
      targetId,
      createdBy: actorId,
    });

    expect(tx.status).toBe("pending");
    expect(tx.operation).toBe("lease_escrow.open_and_fund");
  });

  it("rejects a second open_and_fund for the same target when first is pending", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();

    // First call should succeed.
    await chainTxService.begin({
      operation: "lease_escrow.open_and_fund",
      targetType: "lease",
      targetId,
      createdBy: actorId,
    });

    // Second call for the same target should be rejected.
    await expect(
      chainTxService.begin({
        operation: "lease_escrow.open_and_fund",
        targetType: "lease",
        targetId,
        createdBy: actorId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a second sale_escrow.open_and_fund for the same target", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();

    await chainTxService.begin({
      operation: "sale_escrow.open_and_fund",
      targetType: "purchase_transaction",
      targetId,
      createdBy: actorId,
    });

    await expect(
      chainTxService.begin({
        operation: "sale_escrow.open_and_fund",
        targetType: "purchase_transaction",
        targetId,
        createdBy: actorId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows a new open_and_fund after the previous one failed", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();

    // First attempt — mark it failed.
    const first = await chainTxService.begin({
      operation: "lease_escrow.open_and_fund",
      targetType: "lease",
      targetId,
      createdBy: actorId,
    });
    await chainTxService.markFailed(first.id, new Error("RPC error"));

    // Second attempt should succeed because the first is in "failed" status.
    const second = await chainTxService.begin({
      operation: "lease_escrow.open_and_fund",
      targetType: "lease",
      targetId,
      createdBy: actorId,
    });

    expect(second.status).toBe("pending");
  });

  it("does not apply the guard to non-fund operations", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();

    // Two title.mint operations for the same target should both be allowed
    // (the guard only covers *.open_and_fund).
    await chainTxService.begin({
      operation: "title.mint",
      targetType: "listing",
      targetId,
      createdBy: actorId,
    });

    // Should not throw.
    const second = await chainTxService.begin({
      operation: "title.mint",
      targetType: "listing",
      targetId,
      createdBy: actorId,
    });

    expect(second.operation).toBe("title.mint");
  });
});
