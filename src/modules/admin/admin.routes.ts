import { Router } from "express";
import * as controller from "./admin.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import {
  createAdminSchema,
  listAdminsSchema,
  listUsersSchema,
  overrideComplianceCaseSchema,
} from "./admin.validation";

export const adminUserRouter = Router();

const superAdminOnly = authorize("super_admin");
const admins = authorize("admin", "super_admin");

// ─── Super Admin: Admin Management ──────────────────────────────────────────────

adminUserRouter.post(
  "/admins",
  authenticate,
  superAdminOnly,
  validate(createAdminSchema),
  controller.createAdmin,
);
adminUserRouter.get(
  "/admins",
  authenticate,
  superAdminOnly,
  validate(listAdminsSchema, "query"),
  controller.listAdmins,
);
adminUserRouter.post(
  "/admins/:id/suspend",
  authenticate,
  superAdminOnly,
  controller.suspendAdmin,
);
adminUserRouter.post(
  "/admins/:id/reactivate",
  authenticate,
  superAdminOnly,
  controller.reactivateAdmin,
);

// ─── Super Admin: Restore User + Override Compliance (B3) ────────────────────

adminUserRouter.post(
  "/users/:id/restore",
  authenticate,
  superAdminOnly,
  controller.restoreUser,
);
adminUserRouter.post(
  "/compliance/cases/:id/override",
  authenticate,
  superAdminOnly,
  validate(overrideComplianceCaseSchema),
  controller.overrideComplianceCase,
);

// ─── Admin + Super Admin: User Management ───────────────────────────────────────

adminUserRouter.get(
  "/users",
  authenticate,
  admins,
  validate(listUsersSchema, "query"),
  controller.listUsers,
);
adminUserRouter.get(
  "/users/:id",
  authenticate,
  admins,
  controller.getUserDetail,
);
adminUserRouter.post(
  "/users/:id/suspend",
  authenticate,
  admins,
  controller.suspendUser,
);
adminUserRouter.post(
  "/users/:id/reactivate",
  authenticate,
  admins,
  controller.reactivateUser,
);
adminUserRouter.post(
  "/users/:id/block",
  authenticate,
  admins,
  controller.blockUser,
);
adminUserRouter.post(
  "/users/:id/wallet/revoke",
  authenticate,
  admins,
  controller.revokeUserWallet,
);
