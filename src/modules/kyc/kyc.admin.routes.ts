import { Router } from "express";
import * as controller from "./kyc.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { kycReviewSchema, accountStatusSchema } from "./kyc.validation";

// Admin user management (mounted under /admin). Reuses the listings admin mount.
export const userAdminRouter = Router();

const admins = authorize("admin", "super_admin");

userAdminRouter.patch(
  "/users/:id/status",
  authenticate,
  admins,
  validate(accountStatusSchema),
  controller.adminSetAccountStatus,
);
userAdminRouter.get("/users/:id/kyc", authenticate, admins, controller.adminGetUserKyc);
userAdminRouter.post(
  "/users/:id/kyc/start-review",
  authenticate,
  admins,
  controller.adminStartKycReview,
);
userAdminRouter.post(
  "/users/:id/kyc/review",
  authenticate,
  admins,
  validate(kycReviewSchema),
  controller.adminReviewKyc,
);
userAdminRouter.get(
  "/users/:id/kyc/documents/:docId/url",
  authenticate,
  admins,
  controller.adminGetUserDocumentUrl,
);
