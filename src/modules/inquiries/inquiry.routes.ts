import { Router } from "express";
import * as controller from "./inquiry.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate } from "../../core/middleware/auth.middleware";
import {
  createInquirySchema,
  updateInquirySchema,
} from "./inquiry.validation";

export const inquiryRouter = Router();

inquiryRouter.post("/", authenticate, validate(createInquirySchema), controller.create);
inquiryRouter.get("/mine", authenticate, controller.mine);
inquiryRouter.get("/received", authenticate, controller.received);
inquiryRouter.patch("/:id", authenticate, validate(updateInquirySchema), controller.update);
