import { Router } from "express";
import * as controller from "./listing.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { adminListSchema } from "./listing.validation";

export const adminRouter = Router();

const admins = authorize("admin", "super_admin");

// Review queue: list listings by status across all owners.
adminRouter.get(
  "/listings",
  authenticate,
  admins,
  validate(adminListSchema, "query"),
  controller.adminList,
);

// Admin listing dashboard stats.
adminRouter.get(
  "/listings/stats",
  authenticate,
  admins,
  controller.adminStats,
);
