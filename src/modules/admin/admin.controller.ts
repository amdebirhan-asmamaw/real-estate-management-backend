import { Request, Response, NextFunction } from "express";
import * as adminService from "./admin.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type {
  CreateAdminInput,
  ListAdminsQuery,
  ListUsersQuery,
  OverrideComplianceCaseInput,
} from "./admin.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

// ─── Super Admin: Admin CRUD ────────────────────────────────────────────────────

export const createAdmin: Handler = async (req, res, next) => {
  try {
    const admin = await adminService.createAdmin(
      req.body as CreateAdminInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, admin, "Admin account created");
  } catch (error) {
    next(error);
  }
};

export const listAdmins: Handler = async (req, res, next) => {
  try {
    const result = await adminService.listAdmins(
      req.query as unknown as ListAdminsQuery,
    );
    sendSuccess(res, result, "Admin list");
  } catch (error) {
    next(error);
  }
};

export const suspendAdmin: Handler = async (req, res, next) => {
  try {
    const admin = await adminService.suspendAdmin(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, admin, "Admin suspended");
  } catch (error) {
    next(error);
  }
};

export const reactivateAdmin: Handler = async (req, res, next) => {
  try {
    const admin = await adminService.reactivateAdmin(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, admin, "Admin reactivated");
  } catch (error) {
    next(error);
  }
};

// ─── Admin + Super Admin: User Management ───────────────────────────────────────

export const listUsers: Handler = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(
      req.query as unknown as ListUsersQuery,
    );
    sendSuccess(res, result, "User list");
  } catch (error) {
    next(error);
  }
};

export const getUserDetail: Handler = async (req, res, next) => {
  try {
    const user = await adminService.getUserDetail(req.params.id);
    sendSuccess(res, user, "User detail");
  } catch (error) {
    next(error);
  }
};

export const suspendUser: Handler = async (req, res, next) => {
  try {
    const user = await adminService.suspendUser(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "User suspended");
  } catch (error) {
    next(error);
  }
};

export const reactivateUser: Handler = async (req, res, next) => {
  try {
    const user = await adminService.reactivateUser(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "User reactivated");
  } catch (error) {
    next(error);
  }
};

export const blockUser: Handler = async (req, res, next) => {
  try {
    const user = await adminService.blockUser(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "User blocked");
  } catch (error) {
    next(error);
  }
};

export const revokeUserWallet: Handler = async (req, res, next) => {
  try {
    const user = await adminService.revokeUserWallet(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "User wallet revoked");
  } catch (error) {
    next(error);
  }
};

// ─── Super Admin: Restore + Override (B3) ────────────────────────────────────

export const restoreUser: Handler = async (req, res, next) => {
  try {
    const user = await adminService.restoreUser(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "User restored to active");
  } catch (error) {
    next(error);
  }
};

export const overrideComplianceCase: Handler = async (req, res, next) => {
  try {
    const result = await adminService.overrideComplianceCase(
      req.params.id,
      req.body as OverrideComplianceCaseInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Compliance case overridden");
  } catch (error) {
    next(error);
  }
};
