import { Router } from "express";
import * as controller from "./kyc.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate } from "../../core/middleware/auth.middleware";
import { uploadDocuments } from "../../core/middleware/upload.middleware";
import { kycUploadSchema } from "./kyc.validation";

// Self-service KYC (any authenticated user manages their own).
export const kycRouter = Router();

kycRouter.post(
  "/documents",
  authenticate,
  uploadDocuments,
  validate(kycUploadSchema),
  controller.submit,
);
kycRouter.get("/me", authenticate, controller.me);
kycRouter.get("/documents/:docId/url", authenticate, controller.myDocumentUrl);
