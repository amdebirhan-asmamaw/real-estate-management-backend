import { Router } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import * as controller from "./purchaseTransaction.controller";
import {
  purchaseTransactionQuerySchema,
  updatePurchaseTransactionSchema,
  disputeResolveSchema,
} from "./purchaseTransaction.validation";

export const purchaseTransactionRouter = Router();

purchaseTransactionRouter.get(
  "/",
  authenticate,
  authorize("tenant", "property_owner", "admin", "super_admin"),
  validate(purchaseTransactionQuerySchema, "query"),
  controller.mine,
);
purchaseTransactionRouter.get(
  "/:id",
  authenticate,
  authorize("tenant", "property_owner", "admin", "super_admin"),
  controller.getOne,
);
purchaseTransactionRouter.patch(
  "/:id/status",
  authenticate,
  authorize("admin", "super_admin"),
  validate(updatePurchaseTransactionSchema),
  controller.updateStatus,
);

// ─── Escrow lifecycle routes ──────────────────────────────────────────────────

purchaseTransactionRouter.post(
  "/:id/fund",
  authenticate,
  authorize("admin", "super_admin"),
  controller.fundEscrow,
);
purchaseTransactionRouter.post(
  "/:id/release",
  authenticate,
  authorize("admin", "super_admin"),
  controller.releaseEscrow,
);
purchaseTransactionRouter.post(
  "/:id/refund",
  authenticate,
  authorize("admin", "super_admin"),
  controller.refundEscrow,
);
purchaseTransactionRouter.post(
  "/:id/dispute",
  authenticate,
  authorize("tenant", "property_owner", "admin", "super_admin"),
  controller.openDispute,
);
purchaseTransactionRouter.post(
  "/:id/dispute/resolve",
  authenticate,
  authorize("admin", "super_admin"),
  validate(disputeResolveSchema),
  controller.resolveDisputeHandler,
);
