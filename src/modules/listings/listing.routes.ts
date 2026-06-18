import { Router } from "express";
import * as controller from "./listing.controller";
import * as rentalYieldController from "../rentalYield/rentalYield.controller";
import { validate } from "../../core/middleware/validate.middleware";
import {
  authenticate,
  optionalAuthenticate,
  authorize,
} from "../../core/middleware/auth.middleware";
import {
  uploadPhotos as uploadPhotosMw,
  uploadDocuments as uploadDocsMw,
} from "../../core/middleware/upload.middleware";
import {
  createListingSchema,
  updateListingSchema,
  transitionSchema,
  discoverySchema,
  clusterSchema,
  documentUploadSchema,
  documentReviewSchema,
  photoReorderSchema,
  setCoverSchema,
  titleActionSchema,
  neighborhoodAnalyticsSchema,
} from "./listing.validation";
import {
  maintenanceRecordQuerySchema,
  maintenanceRecordSchema,
} from "../rentalYield/rentalYield.validation";

export const listingRouter = Router();

// property_owner manages own listings; admins manage any. Transition/review
// actions are further gated inside the service per the state machine.
const managers = authorize("property_owner", "admin", "super_admin");
const admins = authorize("admin", "super_admin");

// ─── Public discovery + read ────────────────────────────────────────────────────
listingRouter.get("/", validate(discoverySchema, "query"), controller.discover);
listingRouter.get(
  "/clusters",
  validate(clusterSchema, "query"),
  controller.clusters,
);
listingRouter.get(
  "/analytics/neighborhood",
  optionalAuthenticate,
  validate(neighborhoodAnalyticsSchema, "query"),
  controller.neighborhoodAnalytics,
);
listingRouter.get("/mine", authenticate, managers, controller.mine);
listingRouter.get(
  "/dashboard",
  authenticate,
  managers,
  controller.ownerDashboard,
);
listingRouter.get(
  "/dashboard/yield",
  authenticate,
  managers,
  controller.yieldDashboard,
);
listingRouter.get(
  "/:id/analytics",
  authenticate,
  managers,
  controller.analytics,
);
listingRouter.get(
  "/:id/yield",
  authenticate,
  managers,
  rentalYieldController.yieldSummary,
);
listingRouter.get(
  "/:id/maintenance-records",
  authenticate,
  managers,
  validate(maintenanceRecordQuerySchema, "query"),
  rentalYieldController.listMaintenanceRecords,
);
listingRouter.post(
  "/:id/maintenance-records",
  authenticate,
  managers,
  validate(maintenanceRecordSchema),
  rentalYieldController.createMaintenanceRecord,
);
listingRouter.get("/:id", optionalAuthenticate, controller.getOne);

// ─── Listing lifecycle ──────────────────────────────────────────────────────────
listingRouter.post(
  "/",
  authenticate,
  managers,
  validate(createListingSchema),
  controller.create,
);
listingRouter.patch(
  "/:id",
  authenticate,
  managers,
  validate(updateListingSchema),
  controller.update,
);
listingRouter.delete("/:id", authenticate, managers, controller.remove);
listingRouter.post(
  "/:id/transition",
  authenticate,
  managers,
  validate(transitionSchema),
  controller.transition,
);

// ─── Photos (public gallery) ──────────────────────────────────────────────────
listingRouter.post(
  "/:id/photos",
  authenticate,
  managers,
  uploadPhotosMw,
  controller.uploadPhotos,
);
listingRouter.delete(
  "/:id/photos",
  authenticate,
  managers,
  controller.removePhoto,
);
listingRouter.patch(
  "/:id/photos/reorder",
  authenticate,
  managers,
  validate(photoReorderSchema),
  controller.reorderPhotos,
);
listingRouter.patch(
  "/:id/photos/cover",
  authenticate,
  managers,
  validate(setCoverSchema),
  controller.setCover,
);

// ─── Ownership documents (private) ──────────────────────────────────────────────
listingRouter.post(
  "/:id/documents",
  authenticate,
  managers,
  uploadDocsMw,
  validate(documentUploadSchema),
  controller.uploadDocuments,
);
listingRouter.get(
  "/:id/documents",
  authenticate,
  managers,
  controller.listDocuments,
);
listingRouter.get(
  "/:id/documents/:docId/url",
  authenticate,
  managers,
  controller.documentUrl,
);
listingRouter.post(
  "/:id/documents/:docId/review",
  authenticate,
  admins,
  validate(documentReviewSchema),
  controller.reviewDocument,
);

// ─── Admin review aids ──────────────────────────────────────────────────────────
listingRouter.get(
  "/:id/duplicates",
  authenticate,
  admins,
  controller.duplicates,
);

// ─── On-chain title (Increment 2) ──────────────────────────────────────────────
listingRouter.post(
  "/:id/mint-title",
  authenticate,
  admins,
  controller.mintTitle,
);
listingRouter.get("/:id/title", optionalAuthenticate, controller.title);
listingRouter.get(
  "/:id/certificate",
  optionalAuthenticate,
  controller.certificate,
);
listingRouter.post(
  "/:id/certificate/suspend",
  authenticate,
  admins,
  validate(titleActionSchema),
  controller.suspendCertificate,
);
listingRouter.post(
  "/:id/certificate/restore",
  authenticate,
  admins,
  validate(titleActionSchema),
  controller.restoreCertificate,
);
listingRouter.post(
  "/:id/title/dispute",
  authenticate,
  admins,
  validate(titleActionSchema),
  controller.disputeTitle,
);
listingRouter.post(
  "/:id/title/clear-dispute",
  authenticate,
  admins,
  validate(titleActionSchema),
  controller.clearTitleDispute,
);
listingRouter.post(
  "/:id/title/revoke",
  authenticate,
  admins,
  validate(titleActionSchema),
  controller.revokeTitle,
);
