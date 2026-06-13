import { Router, Request, Response, NextFunction } from "express";
import * as audit from "./audit.service";
import { validate } from "../../core/middleware/validate.middleware";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { auditQuerySchema, AuditQuery } from "./audit.validation";
import { sendSuccess } from "../../core/utils/response";

export const auditRouter = Router();

auditRouter.get(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate(auditQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await audit.listAuditLogs(
        req.query as unknown as AuditQuery,
      );
      sendSuccess(res, result, "Audit logs");
    } catch (error) {
      next(error);
    }
  },
);
