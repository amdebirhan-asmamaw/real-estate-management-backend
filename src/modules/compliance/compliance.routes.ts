import { Router } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import * as controller from "./compliance.controller";
import {
  brokerLicenseQuerySchema,
  brokerLicenseSchema,
  complianceCaseQuerySchema,
  createScreeningSchema,
  reviewBrokerLicenseSchema,
  updateComplianceCaseSchema,
} from "./compliance.validation";

export const complianceRouter = Router();

const admins = authorize("admin", "super_admin");
const owners = authorize("property_owner");

complianceRouter.get(
  "/cases",
  authenticate,
  admins,
  validate(complianceCaseQuerySchema, "query"),
  controller.listCases,
);
complianceRouter.patch(
  "/cases/:id",
  authenticate,
  admins,
  validate(updateComplianceCaseSchema),
  controller.updateCase,
);
complianceRouter.post(
  "/screenings",
  authenticate,
  admins,
  validate(createScreeningSchema),
  controller.createScreening,
);
complianceRouter.post(
  "/broker-licenses",
  authenticate,
  owners,
  validate(brokerLicenseSchema),
  controller.submitBrokerLicense,
);
complianceRouter.get(
  "/broker-licenses",
  authenticate,
  admins,
  validate(brokerLicenseQuerySchema, "query"),
  controller.listBrokerLicenses,
);
complianceRouter.post(
  "/broker-licenses/:id/review",
  authenticate,
  admins,
  validate(reviewBrokerLicenseSchema),
  controller.reviewBrokerLicense,
);
