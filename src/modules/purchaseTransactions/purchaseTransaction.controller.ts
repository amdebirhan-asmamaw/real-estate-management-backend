import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./purchaseTransaction.service";
import type {
  PurchaseTransactionQuery,
  UpdatePurchaseTransactionInput,
} from "./purchaseTransaction.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const mine: Handler = async (req, res, next) => {
  try {
    const result = await service.listMine(
      req.user!.userId,
      req.user!.role,
      req.query as unknown as PurchaseTransactionQuery,
    );
    sendSuccess(res, result, "Purchase transactions");
  } catch (error) {
    next(error);
  }
};

export const getOne: Handler = async (req, res, next) => {
  try {
    const result = await service.getById(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Purchase transaction");
  } catch (error) {
    next(error);
  }
};

export const updateStatus: Handler = async (req, res, next) => {
  try {
    const result = await service.updateStatus(
      req.params.id,
      req.body as UpdatePurchaseTransactionInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Purchase transaction updated");
  } catch (error) {
    next(error);
  }
};
