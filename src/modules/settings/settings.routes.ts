import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./settings.service";
import { updateSettingsSchema } from "./settings.validation";

export const settingsRouter = Router();

// GET /settings — any admin can read
settingsRouter.get(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await service.getSettings();
      sendSuccess(res, settings, "System settings");
    } catch (err) {
      next(err);
    }
  },
);

// PUT /settings — super_admin only
settingsRouter.put(
  "/",
  authenticate,
  authorize("super_admin"),
  validate(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updatedBy = (req as any).user?.id as string | undefined;
      const settings = await service.updateSettings({ ...req.body, updatedBy });
      sendSuccess(res, settings, "System settings updated");
    } catch (err) {
      next(err);
    }
  },
);
