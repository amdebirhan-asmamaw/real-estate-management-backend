import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./chainTransaction.service";
import {
  chainTransactionQuerySchema,
  ChainTransactionQueryInput,
} from "./chainTransaction.validation";

export const chainTransactionRouter = Router();

chainTransactionRouter.get(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate(chainTransactionQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.list(
        req.query as unknown as ChainTransactionQueryInput,
      );
      sendSuccess(res, result, "Chain transactions");
    } catch (error) {
      next(error);
    }
  },
);
