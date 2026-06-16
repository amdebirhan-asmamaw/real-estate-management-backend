import { Request, Response, NextFunction } from "express";
import { sendCreated, sendSuccess } from "../../core/utils/response";
import * as service from "./savedSearch.service";
import type {
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
} from "./savedSearch.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const saved = await service.create(
      req.user!.userId,
      req.body as CreateSavedSearchInput,
    );
    sendCreated(res, saved, "Saved search created");
  } catch (error) {
    next(error);
  }
};

export const mine: Handler = async (req, res, next) => {
  try {
    const saved = await service.listMine(req.user!.userId);
    sendSuccess(res, saved, "Saved searches");
  } catch (error) {
    next(error);
  }
};

export const update: Handler = async (req, res, next) => {
  try {
    const saved = await service.update(
      req.user!.userId,
      req.params.id,
      req.body as UpdateSavedSearchInput,
    );
    sendSuccess(res, saved, "Saved search updated");
  } catch (error) {
    next(error);
  }
};

export const remove: Handler = async (req, res, next) => {
  try {
    await service.remove(req.user!.userId, req.params.id);
    sendSuccess(res, null, "Saved search deleted");
  } catch (error) {
    next(error);
  }
};
