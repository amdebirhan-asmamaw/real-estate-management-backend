import { Router } from "express";
import * as controller from "./inquiry.controller";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import {
  createInquirySchema,
  updateInquirySchema,
  adminListInquiriesSchema,
} from "./inquiry.validation";

export const inquiryRouter = Router();

const admins = authorize("admin", "super_admin");

inquiryRouter.post("/", authenticate, validate(createInquirySchema), controller.create);
inquiryRouter.get("/mine", authenticate, controller.mine);
inquiryRouter.get("/received", authenticate, controller.received);
inquiryRouter.get("/admin", authenticate, admins, validate(adminListInquiriesSchema, "query"), controller.adminList);
inquiryRouter.patch("/:id", authenticate, validate(updateInquirySchema), controller.update);
