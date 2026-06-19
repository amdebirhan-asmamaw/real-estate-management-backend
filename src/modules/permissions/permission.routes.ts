import { Router } from "express";
import * as controller from "./permission.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import {
  assignPermissionsSchema,
  createPermissionSchema,
  listPermissionsSchema,
  revokePermissionsSchema,
  updatePermissionSchema,
} from "./permission.validation";

export const permissionRouter = Router();

const superAdminOnly = authorize("super_admin");
const admins = authorize("admin", "super_admin");

// Permission definition CRUD (super_admin only)
permissionRouter.post(
  "/permissions",
  authenticate,
  superAdminOnly,
  validate(createPermissionSchema),
  controller.create,
);
permissionRouter.get(
  "/permissions",
  authenticate,
  admins,
  validate(listPermissionsSchema, "query"),
  controller.list,
);
permissionRouter.get(
  "/permissions/:id",
  authenticate,
  admins,
  controller.getOne,
);
permissionRouter.patch(
  "/permissions/:id",
  authenticate,
  superAdminOnly,
  validate(updatePermissionSchema),
  controller.update,
);
permissionRouter.delete(
  "/permissions/:id",
  authenticate,
  superAdminOnly,
  controller.remove,
);

// Assign / revoke permissions on admin users (super_admin only)
permissionRouter.get(
  "/admins/:id/permissions",
  authenticate,
  superAdminOnly,
  controller.listAdminPermissions,
);
permissionRouter.post(
  "/admins/:id/permissions",
  authenticate,
  superAdminOnly,
  validate(assignPermissionsSchema),
  controller.assignToAdmin,
);
permissionRouter.delete(
  "/admins/:id/permissions",
  authenticate,
  superAdminOnly,
  validate(revokePermissionsSchema),
  controller.revokeFromAdmin,
);
