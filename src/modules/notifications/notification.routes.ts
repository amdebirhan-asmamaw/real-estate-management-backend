import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import * as controller from "./notification.controller";
import { notificationQuerySchema } from "./notification.validation";

export const notificationRouter = Router();

notificationRouter.get(
  "/",
  authenticate,
  validate(notificationQuerySchema, "query"),
  controller.mine,
);
notificationRouter.post("/read-all", authenticate, controller.readAll);
notificationRouter.post("/:id/read", authenticate, controller.read);
