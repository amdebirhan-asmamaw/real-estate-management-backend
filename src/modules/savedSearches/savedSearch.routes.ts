import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import * as controller from "./savedSearch.controller";
import {
  createSavedSearchSchema,
  updateSavedSearchSchema,
} from "./savedSearch.validation";

export const savedSearchRouter = Router();

savedSearchRouter.get("/", authenticate, controller.mine);
savedSearchRouter.post(
  "/",
  authenticate,
  validate(createSavedSearchSchema),
  controller.create,
);
savedSearchRouter.patch(
  "/:id",
  authenticate,
  validate(updateSavedSearchSchema),
  controller.update,
);
savedSearchRouter.delete("/:id", authenticate, controller.remove);
