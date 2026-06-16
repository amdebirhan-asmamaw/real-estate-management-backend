import { Types } from "mongoose";
import { JsonRpcProvider } from "ethers";
import {
  ChainTransaction,
  ChainTransactionOperation,
  ChainTransactionTargetType,
  IChainTransaction,
} from "./chainTransaction.model";
import { env } from "../../core/config/env";
import { AppError } from "../../core/utils/AppError";
import { StatusCodes } from "http-status-codes";

interface BeginInput {
  operation: ChainTransactionOperation;
  targetType: ChainTransactionTargetType;
  targetId: string;
  createdBy: string;
  contractAddress?: string;
  metadata?: Record<string, unknown>;
}

interface ReconcileInput {
  confirmations?: number;
}

interface MarkMinedInput {
  txHash: string;
  contractAddress?: string;
  metadata?: Record<string, unknown>;
}

export const begin = async (input: BeginInput): Promise<IChainTransaction> =>
  ChainTransaction.create({
    operation: input.operation,
    status: "pending",
    targetType: input.targetType,
    targetId: input.targetId,
    createdBy: input.createdBy,
    contractAddress: input.contractAddress,
    metadata: input.metadata,
  });

export const markMined = async (
  id: string,
  input: MarkMinedInput,
): Promise<IChainTransaction | null> =>
  ChainTransaction.findByIdAndUpdate(
    id,
    {
      status: "mined",
      txHash: input.txHash,
      ...(input.contractAddress && { contractAddress: input.contractAddress }),
      ...(input.metadata && { metadata: input.metadata }),
      $unset: { errorMessage: "" },
    },
    { new: true },
  );

export const markFailed = async (
  id: string,
  error: unknown,
): Promise<IChainTransaction | null> =>
  ChainTransaction.findByIdAndUpdate(
    id,
    {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    },
    { new: true },
  );

export const markConfirmed = async (
  id: string,
  input: { blockNumber?: number; metadata?: Record<string, unknown> } = {},
): Promise<IChainTransaction | null> =>
  ChainTransaction.findByIdAndUpdate(
    id,
    {
      status: "confirmed",
      blockNumber: input.blockNumber,
      confirmedAt: new Date(),
      ...(input.metadata && { metadata: input.metadata }),
      $unset: { errorMessage: "" },
    },
    { new: true },
  );

export const markReverted = async (
  id: string,
  input: { blockNumber?: number; errorMessage?: string; metadata?: Record<string, unknown> } = {},
): Promise<IChainTransaction | null> =>
  ChainTransaction.findByIdAndUpdate(
    id,
    {
      status: "reverted",
      blockNumber: input.blockNumber,
      errorMessage: input.errorMessage ?? "Transaction reverted on-chain",
      ...(input.metadata && { metadata: input.metadata }),
    },
    { new: true },
  );

export const markStale = async (
  id: string,
  reason: string,
): Promise<IChainTransaction | null> =>
  ChainTransaction.findByIdAndUpdate(
    id,
    {
      status: "stale",
      staleAt: new Date(),
      errorMessage: reason,
    },
    { new: true },
  );

export const reconcile = async (
  id: string,
  input: ReconcileInput = {},
): Promise<IChainTransaction> => {
  if (!env.BLOCKCHAIN_RPC_URL) {
    throw new AppError("BLOCKCHAIN_RPC_URL is not configured", StatusCodes.SERVICE_UNAVAILABLE);
  }
  const tx = await ChainTransaction.findById(id);
  if (!tx) throw new AppError("Chain transaction not found", StatusCodes.NOT_FOUND);
  if (!tx.txHash) {
    throw new AppError("Chain transaction has no txHash to reconcile", StatusCodes.CONFLICT);
  }

  const provider = new JsonRpcProvider(env.BLOCKCHAIN_RPC_URL);
  const [receipt, currentBlock] = await Promise.all([
    provider.getTransactionReceipt(tx.txHash),
    provider.getBlockNumber(),
  ]);
  if (!receipt) {
    const updated = await markStale(id, "Transaction receipt was not found on-chain");
    if (!updated) throw new AppError("Chain transaction not found", StatusCodes.NOT_FOUND);
    return updated;
  }

  if (receipt.status === 0) {
    const updated = await markReverted(id, {
      blockNumber: receipt.blockNumber,
      metadata: { ...tx.metadata, reconciledBlock: currentBlock },
    });
    if (!updated) throw new AppError("Chain transaction not found", StatusCodes.NOT_FOUND);
    return updated;
  }

  const requiredConfirmations = input.confirmations ?? 1;
  const confirmations = currentBlock - receipt.blockNumber + 1;
  const status = confirmations >= requiredConfirmations ? "reconciled" : "confirmed";
  const updated = await ChainTransaction.findByIdAndUpdate(
    id,
    {
      status,
      blockNumber: receipt.blockNumber,
      confirmedAt: tx.confirmedAt ?? new Date(),
      ...(status === "reconciled" && { reconciledAt: new Date() }),
      metadata: {
        ...tx.metadata,
        confirmations,
        requiredConfirmations,
        reconciledBlock: currentBlock,
      },
      $unset: { errorMessage: "" },
    },
    { new: true },
  );
  if (!updated) throw new AppError("Chain transaction not found", StatusCodes.NOT_FOUND);
  return updated;
};

export interface ChainTransactionQuery {
  status?: string;
  operation?: string;
  targetType?: string;
  targetId?: string;
  page: number;
  limit: number;
}

export const list = async (
  q: ChainTransactionQuery,
): Promise<{
  items: IChainTransaction[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.operation) filter.operation = q.operation;
  if (q.targetType) filter.targetType = q.targetType;
  if (q.targetId) filter.targetId = new Types.ObjectId(q.targetId);

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    ChainTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit),
    ChainTransaction.countDocuments(filter),
  ]);

  return { items, total, page: q.page, limit: q.limit };
};
