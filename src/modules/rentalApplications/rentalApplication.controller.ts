import { Request, Response, NextFunction } from "express";
import * as service from "./rentalApplication.service";
import { sendCreated, sendSuccess } from "../../core/utils/response";
import type {
  AppointmentInput,
  CreateLeaseFromApplicationInput,
  CreateRentalApplicationInput,
  ReviewRentalApplicationInput,
  ScreeningInput,
} from "./rentalApplication.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const item = await service.create(
      req.user!.userId,
      req.user!.role,
      req.body as CreateRentalApplicationInput,
    );
    sendCreated(res, item, "Rental application submitted");
  } catch (error) {
    next(error);
  }
};

export const mine: Handler = async (req, res, next) => {
  try {
    const items = await service.listMine(req.user!.userId, req.user!.role);
    sendSuccess(res, items, "Rental applications");
  } catch (error) {
    next(error);
  }
};

export const getOne: Handler = async (req, res, next) => {
  try {
    const item = await service.getById(req.params.id, req.user!.userId, req.user!.role);
    sendSuccess(res, item, "Rental application");
  } catch (error) {
    next(error);
  }
};

export const review: Handler = async (req, res, next) => {
  try {
    const item = await service.review(
      req.params.id,
      req.body as ReviewRentalApplicationInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, item, "Rental application reviewed");
  } catch (error) {
    next(error);
  }
};

export const updateScreening: Handler = async (req, res, next) => {
  try {
    const item = await service.updateScreening(
      req.params.id,
      req.body as ScreeningInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, item, "Tenant screening updated");
  } catch (error) {
    next(error);
  }
};

export const updateAppointment: Handler = async (req, res, next) => {
  try {
    const item = await service.updateAppointment(
      req.params.id,
      req.body as AppointmentInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, item, "Appointment updated");
  } catch (error) {
    next(error);
  }
};

export const withdraw: Handler = async (req, res, next) => {
  try {
    const item = await service.withdraw(req.params.id, req.user!.userId, req.user!.role);
    sendSuccess(res, item, "Rental application withdrawn");
  } catch (error) {
    next(error);
  }
};

export const createLease: Handler = async (req, res, next) => {
  try {
    const item = await service.createLease(
      req.params.id,
      req.body as CreateLeaseFromApplicationInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, item, "Lease created from application");
  } catch (error) {
    next(error);
  }
};
