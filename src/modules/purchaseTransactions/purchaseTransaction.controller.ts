import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./purchaseTransaction.service";
import type {
  PurchaseTransactionQuery,
  UpdatePurchaseTransactionInput,
  DisputeResolveInput,
} from "./purchaseTransaction.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

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

export const fundEscrow: Handler = async (req, res, next) => {
  try {
    const result = await service.fund(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Purchase escrow funded");
  } catch (error) {
    next(error);
  }
};

export const releaseEscrow: Handler = async (req, res, next) => {
  try {
    const result = await service.release(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Purchase escrow released");
  } catch (error) {
    next(error);
  }
};

export const refundEscrow: Handler = async (req, res, next) => {
  try {
    const result = await service.refund(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Purchase escrow refunded");
  } catch (error) {
    next(error);
  }
};

export const openDispute: Handler = async (req, res, next) => {
  try {
    const result = await service.dispute(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      req.body?.reason as string | undefined,
    );
    sendSuccess(res, result, "Purchase transaction disputed");
  } catch (error) {
    next(error);
  }
};

export const resolveDisputeHandler: Handler = async (req, res, next) => {
  try {
    const result = await service.resolveDispute(
      req.params.id,
      req.body as DisputeResolveInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Dispute resolved");
  } catch (error) {
    next(error);
  }
};
