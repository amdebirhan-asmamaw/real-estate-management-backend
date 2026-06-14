import { AuditLog, AuditAction, AuditTargetType } from "./audit.model";
import { logger } from "../../core/utils/logger";

interface RecordInput {
  actor: string;
  actorRole: string;
  action: AuditAction;
  targetId: string;
  targetType?: AuditTargetType; // defaults to "listing"
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit entry. Best-effort: an audit failure must never break the
 * business operation that triggered it, so errors are logged and swallowed.
 */
export const record = async (input: RecordInput): Promise<void> => {
  try {
    await AuditLog.create({
      actor: input.actor,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType ?? "listing",
      targetId: input.targetId,
      metadata: input.metadata,
    });
  } catch (error) {
    logger.error("Failed to write audit log:", error);
  }
};

interface ListQuery {
  targetId?: string;
  action?: string;
  page: number;
  limit: number;
}

export const listAuditLogs = async (
  q: ListQuery,
): Promise<{ items: InstanceType<typeof AuditLog>[]; total: number; page: number; limit: number }> => {
  const filter: Record<string, unknown> = {};
  if (q.targetId) filter.targetId = q.targetId;
  if (q.action) filter.action = q.action;

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit),
    AuditLog.countDocuments(filter),
  ]);

  return { items, total, page: q.page, limit: q.limit };
};
