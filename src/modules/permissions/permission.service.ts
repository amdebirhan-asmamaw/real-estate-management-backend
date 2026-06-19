import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Permission, IPermission } from "./permission.model";
import { User, IUser } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import type {
  AssignPermissionsInput,
  CreatePermissionInput,
  ListPermissionsQuery,
  RevokePermissionsInput,
  UpdatePermissionInput,
} from "./permission.validation";

export interface PermissionSummary {
  id: string;
  key: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toSummary = (permission: IPermission): PermissionSummary => ({
  id: permission.id as string,
  key: permission.key,
  name: permission.name,
  description: permission.description,
  isSystem: permission.isSystem,
  createdAt: permission.createdAt,
  updatedAt: permission.updatedAt,
});

const isSuperAdmin = (role: string): boolean => role === "super_admin";

const assertSuperAdmin = (role: string): void => {
  if (!isSuperAdmin(role)) {
    throw new AppError(
      "Only a super admin can manage permissions",
      StatusCodes.FORBIDDEN,
    );
  }
};

const findPermissionOr404 = async (id: string): Promise<IPermission> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid permission id", StatusCodes.BAD_REQUEST);
  }
  const permission = await Permission.findById(id);
  if (!permission) {
    throw new AppError("Permission not found", StatusCodes.NOT_FOUND);
  }
  return permission;
};

const findAdminOr404 = async (adminId: string): Promise<IUser> => {
  if (!Types.ObjectId.isValid(adminId)) {
    throw new AppError("Invalid admin id", StatusCodes.BAD_REQUEST);
  }
  const admin = await User.findById(adminId);
  if (!admin) {
    throw new AppError("Admin user not found", StatusCodes.NOT_FOUND);
  }
  if (admin.role !== "admin") {
    throw new AppError("Target user is not an admin", StatusCodes.BAD_REQUEST);
  }
  return admin;
};

// ─── Permission CRUD ───────────────────────────────────────────────────────────

export const create = async (
  input: CreatePermissionInput,
  actorId: string,
  actorRole: string,
): Promise<PermissionSummary> => {
  assertSuperAdmin(actorRole);

  const existing = await Permission.findOne({ key: input.key.toLowerCase() });
  if (existing) {
    throw new AppError("Permission key already exists", StatusCodes.CONFLICT);
  }

  const permission = await Permission.create({
    key: input.key.toLowerCase(),
    name: input.name,
    description: input.description || undefined,
  });

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.permission_created",
    targetType: "admin",
    targetId: permission.id as string,
    metadata: { key: permission.key },
  });

  return toSummary(permission);
};

export const list = async (
  query: ListPermissionsQuery,
): Promise<{
  items: PermissionSummary[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const regex = new RegExp(query.search, "i");
    filter.$or = [{ key: regex }, { name: regex }, { description: regex }];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    Permission.find(filter).sort({ key: 1 }).skip(skip).limit(query.limit),
    Permission.countDocuments(filter),
  ]);

  return {
    items: items.map(toSummary),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export const getById = async (id: string): Promise<PermissionSummary> => {
  const permission = await findPermissionOr404(id);
  return toSummary(permission);
};

export const update = async (
  id: string,
  input: UpdatePermissionInput,
  actorId: string,
  actorRole: string,
): Promise<PermissionSummary> => {
  assertSuperAdmin(actorRole);

  const permission = await findPermissionOr404(id);
  if (input.name !== undefined) permission.name = input.name;
  if (input.description !== undefined) {
    permission.description = input.description || undefined;
  }
  await permission.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.permission_updated",
    targetType: "admin",
    targetId: permission.id as string,
    metadata: { key: permission.key, fields: Object.keys(input) },
  });

  return toSummary(permission);
};

export const remove = async (
  id: string,
  actorId: string,
  actorRole: string,
): Promise<void> => {
  assertSuperAdmin(actorRole);

  const permission = await findPermissionOr404(id);
  if (permission.isSystem) {
    throw new AppError(
      "System permissions cannot be deleted",
      StatusCodes.FORBIDDEN,
    );
  }

  const assignedCount = await User.countDocuments({ permissions: permission._id });
  if (assignedCount > 0) {
    throw new AppError(
      "Permission is assigned to one or more admins; revoke it first",
      StatusCodes.CONFLICT,
    );
  }

  await permission.deleteOne();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.permission_deleted",
    targetType: "admin",
    targetId: id,
    metadata: { key: permission.key },
  });
};

// ─── Admin permission assignment ─────────────────────────────────────────────

export const listAdminPermissions = async (
  adminId: string,
): Promise<PermissionSummary[]> => {
  const admin = await findAdminOr404(adminId);
  await admin.populate("permissions");
  const populated = admin.permissions as unknown as IPermission[];
  return populated.map(toSummary);
};

export const assignToAdmin = async (
  adminId: string,
  input: AssignPermissionsInput,
  actorId: string,
  actorRole: string,
): Promise<PermissionSummary[]> => {
  assertSuperAdmin(actorRole);

  const admin = await findAdminOr404(adminId);
  const permissions = await Permission.find({ _id: { $in: input.permissionIds } });
  if (permissions.length !== input.permissionIds.length) {
    throw new AppError("One or more permissions not found", StatusCodes.NOT_FOUND);
  }

  const existing = new Set(admin.permissions.map((id) => id.toString()));
  for (const permission of permissions) {
    if (!existing.has(permission.id as string)) {
      admin.permissions.push(permission._id);
    }
  }
  await admin.save();
  await admin.populate("permissions");

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.permission_assigned",
    targetType: "admin",
    targetId: adminId,
    metadata: {
      permissionIds: input.permissionIds,
      keys: permissions.map((p) => p.key),
    },
  });

  return (admin.permissions as unknown as IPermission[]).map(toSummary);
};

export const revokeFromAdmin = async (
  adminId: string,
  input: RevokePermissionsInput,
  actorId: string,
  actorRole: string,
): Promise<PermissionSummary[]> => {
  assertSuperAdmin(actorRole);

  const admin = await findAdminOr404(adminId);
  const revokeSet = new Set(input.permissionIds);
  const permissions = await Permission.find({ _id: { $in: input.permissionIds } });
  if (permissions.length !== input.permissionIds.length) {
    throw new AppError("One or more permissions not found", StatusCodes.NOT_FOUND);
  }

  admin.permissions = admin.permissions.filter(
    (id) => !revokeSet.has(id.toString()),
  );
  await admin.save();
  await admin.populate("permissions");

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.permission_revoked",
    targetType: "admin",
    targetId: adminId,
    metadata: {
      permissionIds: input.permissionIds,
      keys: permissions.map((p) => p.key),
    },
  });

  return (admin.permissions as unknown as IPermission[]).map(toSummary);
};

/** Returns permission keys for an admin user (empty for non-admins). */
export const keysForUser = async (userId: string): Promise<string[]> => {
  const user = await User.findById(userId).populate("permissions");
  if (!user || user.role !== "admin") return [];
  return (user.permissions as unknown as IPermission[]).map((p) => p.key);
};

export const userHasPermissions = async (
  userId: string,
  role: string,
  required: string[],
): Promise<boolean> => {
  if (role === "super_admin") return true;
  if (role !== "admin" || required.length === 0) return false;
  const keys = await keysForUser(userId);
  return required.every((key) => keys.includes(key.toLowerCase()));
};
