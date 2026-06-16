import { Request, Response, NextFunction } from "express";
import * as service from "./inquiry.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type { CreateInquiryInput, UpdateInquiryInput, AdminListInquiriesQuery } from "./inquiry.validation";

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const inquiry = await service.createInquiry(
      req.user!.userId,
      req.user!.role,
      req.body as CreateInquiryInput,
    );
    sendCreated(res, inquiry, "Inquiry sent");
  } catch (error) {
    next(error);
  }
};

export const mine = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const items = await service.listSent(req.user!.userId);
    sendSuccess(res, items, "Inquiries you sent");
  } catch (error) {
    next(error);
  }
};

export const received = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const items = await service.listReceived(req.user!.userId);
    sendSuccess(res, items, "Inquiries on your listings");
  } catch (error) {
    next(error);
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const inquiry = await service.updateInquiry(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      req.body as UpdateInquiryInput,
    );
    sendSuccess(res, inquiry, "Inquiry updated");
  } catch (error) {
    next(error);
  }
};

export const adminList = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await service.adminList(
      req.query as unknown as AdminListInquiriesQuery,
    );
    sendSuccess(res, result, "All inquiries");
  } catch (error) {
    next(error);
  }
};
