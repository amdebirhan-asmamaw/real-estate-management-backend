import { StatusCodes } from "http-status-codes";
import { User, IUser, type UserRole } from "../auth/auth.model";
import { ComplianceCase } from "../compliance/compliance.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import * as authService from "../auth/auth.service";
import type {
  CreateAdminInput,
  ListAdminsQuery,
  ListUsersQuery,
  OverrideComplianceCaseInput,
} from "./admin.validation";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

const isAdmin = (role: string): boolean =>
  role === "admin" || role === "super_admin";

const isSuperAdmin = (role: string): boolean => role === "super_admin";

const findUserOr404 = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", StatusCodes.NOT_FOUND);
  return user;
};

/**
 * Guard: prevents actions on super_admin users, and prevents admin-on-admin
 * actions (only super_admin can manage other admins).
 */
const guardStatusChange = (
  target: IUser,
  actorRole: string,
  action: string,
): void => {
  if (target.role === "super_admin") {
    throw new AppError(
      "Cannot modify a super admin account",
      StatusCodes.FORBIDDEN,
    );
  }
  if (
    target.role === "admin" &&
    !isSuperAdmin(actorRole)
  ) {
    throw new AppError(
      `Only a super admin can ${action} an admin account`,
      StatusCodes.FORBIDDEN,
    );
  }
};

// Build the user public detail (more complete than auth's toPublicUser).
const toUserDetail = (user: IUser) => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  profileImage: user.profileImage,
  accountStatus: user.accountStatus,
  kycStatus: user.kycStatus,
  emailVerified: user.emailVerified,
  mustResetPassword: user.mustResetPassword,
  walletAddress: user.walletAddress,
  walletStatus: user.walletStatus,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// ─── Super Admin: Admin CRUD ────────────────────────────────────────────────────

export const createAdmin = async (
  input: CreateAdminInput,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  if (!isSuperAdmin(actorRole)) {
    throw new AppError(
      "Only a super admin can create admin accounts",
      StatusCodes.FORBIDDEN,
    );
  }

  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError("Email already registered", StatusCodes.CONFLICT);
  }

  const admin = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
    phone: input.phone,
    role: "admin" as UserRole,
    accountStatus: "active",
    kycStatus: "verified",
    mustResetPassword: true,
  });

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.created_admin",
    targetType: "admin",
    targetId: admin.id as string,
    metadata: { email: input.email },
  });

  await notifications.notify({
    recipient: admin.id as string,
    type: "auth.registration",
    title: "Admin account created",
    message:
      "Your admin account has been created. Please change your password on first login.",
  });

  return toUserDetail(admin);
};

export const listAdmins = async (
  query: ListAdminsQuery,
): Promise<{
  items: ReturnType<typeof toUserDetail>[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: Record<string, unknown> = { role: { $in: ADMIN_ROLES } };
  if (query.status) filter.accountStatus = query.status;
  if (query.search) {
    const regex = new RegExp(query.search, "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map(toUserDetail),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export const suspendAdmin = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  if (!isSuperAdmin(actorRole)) {
    throw new AppError(
      "Only a super admin can suspend admin accounts",
      StatusCodes.FORBIDDEN,
    );
  }

  const target = await findUserOr404(targetId);
  if (target.role === "super_admin") {
    throw new AppError(
      "Cannot suspend a super admin account",
      StatusCodes.FORBIDDEN,
    );
  }
  if (!isAdmin(target.role)) {
    throw new AppError(
      "Target user is not an admin",
      StatusCodes.BAD_REQUEST,
    );
  }
  if (targetId === actorId) {
    throw new AppError(
      "Cannot suspend your own account",
      StatusCodes.BAD_REQUEST,
    );
  }

  target.accountStatus = "suspended";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.suspended_admin",
    targetType: "admin",
    targetId,
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.suspended",
    title: "Account suspended",
    message: "Your admin account has been suspended. Contact your super admin for details.",
  });

  return toUserDetail(target);
};

export const reactivateAdmin = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  if (!isSuperAdmin(actorRole)) {
    throw new AppError(
      "Only a super admin can reactivate admin accounts",
      StatusCodes.FORBIDDEN,
    );
  }

  const target = await findUserOr404(targetId);
  if (!isAdmin(target.role)) {
    throw new AppError(
      "Target user is not an admin",
      StatusCodes.BAD_REQUEST,
    );
  }
  if (target.accountStatus !== "suspended") {
    throw new AppError(
      "Only suspended admin accounts can be reactivated",
      StatusCodes.BAD_REQUEST,
    );
  }

  target.accountStatus = "active";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.reactivated_admin",
    targetType: "admin",
    targetId,
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.reactivated",
    title: "Account reactivated",
    message: "Your admin account has been reactivated.",
  });

  return toUserDetail(target);
};

// ─── Admin + Super Admin: User Management ───────────────────────────────────────

export const listUsers = async (
  query: ListUsersQuery,
): Promise<{
  items: ReturnType<typeof toUserDetail>[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.accountStatus = query.status;
  if (query.kycStatus) filter.kycStatus = query.kycStatus;
  if (query.walletStatus) filter.walletStatus = query.walletStatus;
  if (query.search) {
    const regex = new RegExp(query.search, "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const sortField = query.sort.startsWith("-")
    ? query.sort.slice(1)
    : query.sort;
  const sortOrder: 1 | -1 = query.sort.startsWith("-") ? -1 : 1;

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(query.limit),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map(toUserDetail),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export const getUserDetail = async (
  userId: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  const user = await findUserOr404(userId);
  return toUserDetail(user);
};

export const suspendUser = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  const target = await findUserOr404(targetId);
  guardStatusChange(target, actorRole, "suspend");

  if (targetId === actorId) {
    throw new AppError("Cannot suspend your own account", StatusCodes.BAD_REQUEST);
  }
  if (target.accountStatus === "suspended") {
    throw new AppError("User is already suspended", StatusCodes.BAD_REQUEST);
  }

  target.accountStatus = "suspended";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.suspended_user",
    targetType: "user",
    targetId,
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.suspended",
    title: "Account suspended",
    message: "Your account has been suspended. Contact support for details.",
  });

  return toUserDetail(target);
};

export const reactivateUser = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  const target = await findUserOr404(targetId);
  guardStatusChange(target, actorRole, "reactivate");

  if (target.accountStatus !== "suspended") {
    throw new AppError(
      "Only suspended accounts can be reactivated",
      StatusCodes.BAD_REQUEST,
    );
  }

  target.accountStatus = "active";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.reactivated_user",
    targetType: "user",
    targetId,
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.reactivated",
    title: "Account reactivated",
    message: "Your account has been reactivated. You may now use the platform again.",
  });

  return toUserDetail(target);
};

export const revokeUserWallet = async (
  targetId: string,
  _actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  const target = await findUserOr404(targetId);
  guardStatusChange(target, actorRole, "revoke wallet for");

  // Delegates escrow guard + state update + audit to authService.revokeWallet.
  // authService records the audit action under the target's own identity;
  // the admin action is reflected via guardStatusChange above.
  await authService.revokeWallet(targetId);

  // Re-fetch to return a fresh snapshot after the wallet was cleared.
  const updated = await findUserOr404(targetId);
  return toUserDetail(updated);
};

export const blockUser = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  const target = await findUserOr404(targetId);
  guardStatusChange(target, actorRole, "block");

  if (targetId === actorId) {
    throw new AppError("Cannot block your own account", StatusCodes.BAD_REQUEST);
  }
  if (target.accountStatus === "blocked") {
    throw new AppError("User is already blocked", StatusCodes.BAD_REQUEST);
  }

  target.accountStatus = "blocked";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.blocked_user",
    targetType: "user",
    targetId,
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.blocked",
    title: "Account blocked",
    message: "Your account has been blocked due to a policy violation.",
  });

  return toUserDetail(target);
};

// ─── Super Admin: Restore User (B3) ─────────────────────────────────────────

/**
 * Restores a blocked or suspended user to active status.
 * Super admin only — prevents misuse of a more powerful tool than reactivate.
 */
export const restoreUser = async (
  targetId: string,
  actorId: string,
  actorRole: string,
): Promise<ReturnType<typeof toUserDetail>> => {
  if (!isSuperAdmin(actorRole)) {
    throw new AppError(
      "Only a super admin can restore blocked or suspended users",
      StatusCodes.FORBIDDEN,
    );
  }

  const target = await findUserOr404(targetId);

  if (target.accountStatus !== "blocked" && target.accountStatus !== "suspended") {
    throw new AppError(
      "Only blocked or suspended accounts can be restored",
      StatusCodes.BAD_REQUEST,
    );
  }

  const previousStatus = target.accountStatus;
  target.accountStatus = "active";
  await target.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.restored_user",
    targetType: "user",
    targetId,
    metadata: { previousStatus },
  });

  await notifications.notify({
    recipient: targetId,
    type: "account.reactivated",
    title: "Account restored",
    message: "Your account has been restored by the platform administrator. You may now use the platform.",
  });

  return toUserDetail(target);
};

// ─── Super Admin: Override Compliance Case (B3) ──────────────────────────────

/**
 * Force-sets a compliance case to a terminal status (resolved | dismissed) with
 * a mandatory reason. Super admin only — regular admins must use updateCase.
 */
export const overrideComplianceCase = async (
  caseId: string,
  input: OverrideComplianceCaseInput,
  actorId: string,
  actorRole: string,
) => {
  if (!isSuperAdmin(actorRole)) {
    throw new AppError(
      "Only a super admin can override compliance cases",
      StatusCodes.FORBIDDEN,
    );
  }

  const complianceCase = await ComplianceCase.findById(caseId);
  if (!complianceCase) {
    throw new AppError("Compliance case not found", StatusCodes.NOT_FOUND);
  }

  if (complianceCase.status === "resolved" || complianceCase.status === "dismissed") {
    throw new AppError(
      "Compliance case is already in a terminal status",
      StatusCodes.BAD_REQUEST,
    );
  }

  complianceCase.status = input.status;
  complianceCase.resolution = input.reason;
  complianceCase.notes.push({
    author: actorId as unknown as (typeof complianceCase.notes)[number]["author"],
    body: `[Super-admin override] ${input.reason}`,
    createdAt: new Date(),
  });
  await complianceCase.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "admin.override_decision",
    targetType: "compliance",
    targetId: caseId,
    metadata: { status: input.status, reason: input.reason },
  });

  return complianceCase;
};
