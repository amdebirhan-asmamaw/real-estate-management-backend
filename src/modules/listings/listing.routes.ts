import { Router } from "express";
import * as controller from "./listing.controller";
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
  documentUploadSchema,
  documentReviewSchema,
  photoReorderSchema,
  setCoverSchema,
  titleActionSchema,
} from "./listing.validation";

export const listingRouter = Router();

// property_owner manages own listings; admins manage any. Transition/review
// actions are further gated inside the service per the state machine.
const managers = authorize("property_owner", "admin", "super_admin");
const admins = authorize("admin", "super_admin");

// ─── Public discovery + read ────────────────────────────────────────────────────
listingRouter.get("/", validate(discoverySchema, "query"), controller.discover);
listingRouter.get("/mine", authenticate, managers, controller.mine);
listingRouter.get("/dashboard", authenticate, managers, controller.ownerDashboard);
listingRouter.get("/:id/analytics", authenticate, managers, controller.analytics);
listingRouter.get("/:id", optionalAuthenticate, controller.getOne);

// ─── Listing lifecycle ──────────────────────────────────────────────────────────
listingRouter.post("/", authenticate, managers, validate(createListingSchema), controller.create);
listingRouter.patch("/:id", authenticate, managers, validate(updateListingSchema), controller.update);
listingRouter.delete("/:id", authenticate, managers, controller.remove);
listingRouter.post("/:id/transition", authenticate, managers, validate(transitionSchema), controller.transition);

// ─── Photos (public gallery) ──────────────────────────────────────────────────
listingRouter.post("/:id/photos", authenticate, managers, uploadPhotosMw, controller.uploadPhotos);
listingRouter.delete("/:id/photos", authenticate, managers, controller.removePhoto);
listingRouter.patch("/:id/photos/reorder", authenticate, managers, validate(photoReorderSchema), controller.reorderPhotos);
listingRouter.patch("/:id/photos/cover", authenticate, managers, validate(setCoverSchema), controller.setCover);

// ─── Ownership documents (private) ──────────────────────────────────────────────
listingRouter.post(
  "/:id/documents",
  authenticate,
  managers,
  uploadDocsMw,
  validate(documentUploadSchema),
  controller.uploadDocuments,
);
listingRouter.get("/:id/documents", authenticate, managers, controller.listDocuments);
listingRouter.get("/:id/documents/:docId/url", authenticate, managers, controller.documentUrl);
listingRouter.post(
  "/:id/documents/:docId/review",
  authenticate,
  admins,
  validate(documentReviewSchema),
  controller.reviewDocument,
);

// ─── Admin review aids ──────────────────────────────────────────────────────────
listingRouter.get("/:id/duplicates", authenticate, admins, controller.duplicates);

// ─── On-chain title (Increment 2) ──────────────────────────────────────────────
listingRouter.post("/:id/mint-title", authenticate, admins, controller.mintTitle);
listingRouter.get("/:id/title", optionalAuthenticate, controller.title);
listingRouter.post("/:id/title/dispute", authenticate, admins, validate(titleActionSchema), controller.disputeTitle);
listingRouter.post("/:id/title/clear-dispute", authenticate, admins, validate(titleActionSchema), controller.clearTitleDispute);
listingRouter.post("/:id/title/revoke", authenticate, admins, validate(titleActionSchema), controller.revokeTitle);
