import { Router } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import * as controller from "./offer.controller";
import { createOfferSchema, respondOfferSchema } from "./offer.validation";

export const offerRouter = Router();

const tenants = authorize("tenant", "admin", "super_admin");
const ownerOrAdmin = authorize("property_owner", "admin", "super_admin");

offerRouter.get("/mine", authenticate, tenants, controller.mine);
offerRouter.get("/received", authenticate, ownerOrAdmin, controller.received);
offerRouter.post(
  "/",
  authenticate,
  tenants,
  validate(createOfferSchema),
  controller.create,
);
offerRouter.patch(
  "/:id/respond",
  authenticate,
  ownerOrAdmin,
  validate(respondOfferSchema),
  controller.respond,
);
offerRouter.post("/:id/cancel", authenticate, tenants, controller.cancel);
