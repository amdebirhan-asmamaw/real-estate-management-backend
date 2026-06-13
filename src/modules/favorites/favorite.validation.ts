import Joi from "joi";

export const createFavoriteSchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
});

export type CreateFavoriteInput = { listingId: string };
