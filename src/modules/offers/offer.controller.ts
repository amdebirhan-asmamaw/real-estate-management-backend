import { Request, Response, NextFunction } from "express";
import { sendCreated, sendSuccess } from "../../core/utils/response";
import * as service from "./offer.service";
import type { CreateOfferInput, RespondOfferInput } from "./offer.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const offer = await service.createOffer(
      req.user!.userId,
      req.user!.role,
      req.body as CreateOfferInput,
    );
    sendCreated(res, offer, "Offer submitted");
  } catch (error) {
    next(error);
  }
};

export const mine: Handler = async (req, res, next) => {
  try {
    const offers = await service.listMine(req.user!.userId);
    sendSuccess(res, offers, "Your offers");
  } catch (error) {
    next(error);
  }
};

export const received: Handler = async (req, res, next) => {
  try {
    const offers = await service.listReceived(req.user!.userId);
    sendSuccess(res, offers, "Received offers");
  } catch (error) {
    next(error);
  }
};

export const respond: Handler = async (req, res, next) => {
  try {
    const offer = await service.respond(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      req.body as RespondOfferInput,
    );
    sendSuccess(res, offer, "Offer updated");
  } catch (error) {
    next(error);
  }
};

export const cancel: Handler = async (req, res, next) => {
  try {
    const offer = await service.cancel(req.params.id, req.user!.userId);
    sendSuccess(res, offer, "Offer cancelled");
  } catch (error) {
    next(error);
  }
};
