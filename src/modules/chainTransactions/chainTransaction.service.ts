import { Types } from "mongoose";
import {
  ChainTransaction,
  ChainTransactionOperation,
  ChainTransactionTargetType,
  IChainTransaction,
} from "./chainTransaction.model";

interface BeginInput {
  operation: ChainTransactionOperation;
  targetType: ChainTransactionTargetType;
  targetId: string;
  createdBy: string;
  contractAddress?: string;
  metadata?: Record<string, unknown>;
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
