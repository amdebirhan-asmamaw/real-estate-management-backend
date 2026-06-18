import { Request, Response, NextFunction } from "express";
import { sendCreated, sendSuccess } from "../../core/utils/response";
import * as service from "./rentalYield.service";
import type {
  MaintenanceRecordInput,
  MaintenanceRecordQuery,
} from "./rentalYield.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const createMaintenanceRecord: Handler = async (req, res, next) => {
  try {
    const record = await service.createMaintenanceRecord(
      req.params.id,
      req.body as MaintenanceRecordInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, record, "Maintenance record created");
  } catch (error) {
    next(error);
  }
};

export const listMaintenanceRecords: Handler = async (req, res, next) => {
  try {
    const result = await service.listMaintenanceRecords(
      req.params.id,
      req.query as unknown as MaintenanceRecordQuery,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Maintenance records");
  } catch (error) {
    next(error);
  }
};

export const yieldSummary: Handler = async (req, res, next) => {
  try {
    const result = await service.getYieldSummary(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Rental yield summary");
  } catch (error) {
    next(error);
  }
};
