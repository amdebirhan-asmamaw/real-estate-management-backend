import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./notification.service";
import type { NotificationQueryInput } from "./notification.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const mine: Handler = async (req, res, next) => {
  try {
    const result = await service.listMine(
      req.user!.userId,
      req.query as unknown as NotificationQueryInput,
    );
    sendSuccess(res, result, "Notifications");
  } catch (error) {
    next(error);
  }
};

export const read: Handler = async (req, res, next) => {
  try {
    const notification = await service.markRead(req.user!.userId, req.params.id);
    sendSuccess(res, notification, "Notification marked read");
  } catch (error) {
    next(error);
  }
};

export const readAll: Handler = async (req, res, next) => {
  try {
    await service.markAllRead(req.user!.userId);
    sendSuccess(res, null, "Notifications marked read");
  } catch (error) {
    next(error);
  }
};
