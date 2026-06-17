import { Router } from "express";
import * as controller from "./lease.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import {
  createLeaseSchema,
  disputeResolveSchema,
  signLeaseSchema,
  disputeOpenSchema,
  disputeRespondSchema,
} from "./lease.validation";

export const leaseRouter = Router();

const landlords = authorize("property_owner", "admin", "super_admin");
const admins = authorize("admin", "super_admin");
const anyParty = authorize("property_owner", "tenant", "admin", "super_admin");

leaseRouter.get("/mine", authenticate, anyParty, controller.mine);
leaseRouter.get("/:id", authenticate, anyParty, controller.getOne);
leaseRouter.get("/:id/escrow", authenticate, anyParty, controller.escrowInfo);

leaseRouter.post("/", authenticate, landlords, validate(createLeaseSchema), controller.create);
leaseRouter.post("/:id/propose", authenticate, landlords, controller.propose);
leaseRouter.post(
  "/:id/sign",
  authenticate,
  authorize("tenant", "admin", "super_admin"),
  validate(signLeaseSchema),
  controller.sign,
);

leaseRouter.post("/:id/fund", authenticate, admins, controller.fund);
leaseRouter.post("/:id/activate", authenticate, admins, controller.activate);
leaseRouter.post("/:id/complete", authenticate, admins, controller.complete);
leaseRouter.post("/:id/terminate", authenticate, admins, controller.terminate);
leaseRouter.post("/:id/dispute/resolve", authenticate, admins, validate(disputeResolveSchema), controller.resolveDispute);

leaseRouter.post("/:id/cancel", authenticate, anyParty, controller.cancel);
leaseRouter.post(
  "/:id/dispute",
  authenticate,
  anyParty,
  validate(disputeOpenSchema),
  controller.dispute,
);
leaseRouter.post(
  "/:id/dispute/respond",
  authenticate,
  anyParty,
  validate(disputeRespondSchema),
  controller.disputeRespond,
);
