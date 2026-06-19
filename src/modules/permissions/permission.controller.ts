import { Request, Response, NextFunction } from "express";
import * as permissionService from "./permission.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type {
  AssignPermissionsInput,
  CreatePermissionInput,
  ListPermissionsQuery,
  RevokePermissionsInput,
  UpdatePermissionInput,
} from "./permission.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const permission = await permissionService.create(
      req.body as CreatePermissionInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, permission, "Permission created");
  } catch (error) {
    next(error);
  }
};

export const list: Handler = async (req, res, next) => {
  try {
    const result = await permissionService.list(
      req.query as unknown as ListPermissionsQuery,
    );
    sendSuccess(res, result, "Permissions");
  } catch (error) {
    next(error);
  }
};

export const getOne: Handler = async (req, res, next) => {
  try {
    const permission = await permissionService.getById(req.params.id);
    sendSuccess(res, permission, "Permission");
  } catch (error) {
    next(error);
  }
};

export const update: Handler = async (req, res, next) => {
  try {
    const permission = await permissionService.update(
      req.params.id,
      req.body as UpdatePermissionInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, permission, "Permission updated");
  } catch (error) {
    next(error);
  }
};

export const remove: Handler = async (req, res, next) => {
  try {
    await permissionService.remove(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, null, "Permission deleted");
  } catch (error) {
    next(error);
  }
};

export const listAdminPermissions: Handler = async (req, res, next) => {
  try {
    const permissions = await permissionService.listAdminPermissions(
      req.params.id,
    );
    sendSuccess(res, permissions, "Admin permissions");
  } catch (error) {
    next(error);
  }
};

export const assignToAdmin: Handler = async (req, res, next) => {
  try {
    const permissions = await permissionService.assignToAdmin(
      req.params.id,
      req.body as AssignPermissionsInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, permissions, "Permissions assigned");
  } catch (error) {
    next(error);
  }
};

export const revokeFromAdmin: Handler = async (req, res, next) => {
  try {
    const permissions = await permissionService.revokeFromAdmin(
      req.params.id,
      req.body as RevokePermissionsInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, permissions, "Permissions revoked");
  } catch (error) {
    next(error);
  }
};
