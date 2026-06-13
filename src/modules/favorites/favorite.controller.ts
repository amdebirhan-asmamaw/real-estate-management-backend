import { Request, Response, NextFunction } from "express";
import * as service from "./favorite.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type { CreateFavoriteInput } from "./favorite.validation";

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const listings = await service.listFavorites(req.user!.userId);
    sendSuccess(res, listings, "Your favorites");
  } catch (error) {
    next(error);
  }
};

export const add = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { listingId } = req.body as CreateFavoriteInput;
    const favorite = await service.addFavorite(
      req.user!.userId,
      listingId,
      req.user!.role,
    );
    sendCreated(res, favorite, "Listing saved to favorites");
  } catch (error) {
    next(error);
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.removeFavorite(req.user!.userId, req.params.listingId);
    sendSuccess(res, null, "Listing removed from favorites");
  } catch (error) {
    next(error);
  }
};
