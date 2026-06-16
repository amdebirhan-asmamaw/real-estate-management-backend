import { Router } from "express";
import * as controller from "./rentalApplication.controller";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import {
  appointmentSchema,
  createLeaseFromApplicationSchema,
  createRentalApplicationSchema,
  reviewRentalApplicationSchema,
  screeningSchema,
} from "./rentalApplication.validation";

export const rentalApplicationRouter = Router();

const tenants = authorize("tenant");
const anyParty = authorize("tenant", "property_owner", "admin", "super_admin");
const managers = authorize("property_owner", "admin", "super_admin");

rentalApplicationRouter.get("/mine", authenticate, anyParty, controller.mine);
rentalApplicationRouter.get("/:id", authenticate, anyParty, controller.getOne);

rentalApplicationRouter.post(
  "/",
  authenticate,
  tenants,
  validate(createRentalApplicationSchema),
  controller.create,
);
rentalApplicationRouter.post("/:id/withdraw", authenticate, tenants, controller.withdraw);

rentalApplicationRouter.patch(
  "/:id/review",
  authenticate,
  managers,
  validate(reviewRentalApplicationSchema),
  controller.review,
);
rentalApplicationRouter.patch(
  "/:id/screening",
  authenticate,
  managers,
  validate(screeningSchema),
  controller.updateScreening,
);
rentalApplicationRouter.patch(
  "/:id/appointment",
  authenticate,
  anyParty,
  validate(appointmentSchema),
  controller.updateAppointment,
);
rentalApplicationRouter.post(
  "/:id/lease",
  authenticate,
  managers,
  validate(createLeaseFromApplicationSchema),
  controller.createLease,
);
