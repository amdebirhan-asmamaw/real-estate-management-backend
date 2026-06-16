import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../core/middleware/auth.middleware";
import { validate } from "../../core/middleware/validate.middleware";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./chainTransaction.service";
import {
  chainTransactionQuerySchema,
  ChainTransactionQueryInput,
  reconcileChainTransactionSchema,
  ReconcileChainTransactionInput,
  staleChainTransactionSchema,
  StaleChainTransactionInput,
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

chainTransactionRouter.post(
  "/:id/reconcile",
  authenticate,
  authorize("admin", "super_admin"),
  validate(reconcileChainTransactionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.reconcile(
        req.params.id,
        req.body as ReconcileChainTransactionInput,
      );
      sendSuccess(res, result, "Chain transaction reconciled");
    } catch (error) {
      next(error);
    }
  },
);

chainTransactionRouter.post(
  "/:id/mark-stale",
  authenticate,
  authorize("admin", "super_admin"),
  validate(staleChainTransactionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.markStale(
        req.params.id,
        (req.body as StaleChainTransactionInput).reason,
      );
      sendSuccess(res, result, "Chain transaction marked stale");
    } catch (error) {
      next(error);
    }
  },
);
