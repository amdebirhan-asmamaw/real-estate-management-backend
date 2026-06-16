import Joi from "joi";

const point = Joi.array()
  .ordered(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90))
  .length(2);

const savedQuery = Joi.object({
  swLng: Joi.number().min(-180).max(180),
  swLat: Joi.number().min(-90).max(90),
  neLng: Joi.number().min(-180).max(180),
  neLat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  lat: Joi.number().min(-90).max(90),
  radius: Joi.number().positive(),
  polygon: Joi.array().items(point).min(4),
  listingType: Joi.string().valid("sale", "rent"),
  category: Joi.string().valid("residential", "commercial"),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  minBedrooms: Joi.number().min(0),
  minBathrooms: Joi.number().min(0),
})
  .and("swLng", "swLat", "neLng", "neLat")
  .and("lng", "lat", "radius")
  .oxor("swLng", "lng", "polygon")
  .min(1);

export const createSavedSearchSchema = Joi.object({
  name: Joi.string().max(120).required(),
  query: savedQuery.required(),
  alertEnabled: Joi.boolean().default(false),
});

export const updateSavedSearchSchema = Joi.object({
  name: Joi.string().max(120),
  query: savedQuery,
  alertEnabled: Joi.boolean(),
}).min(1);

export type CreateSavedSearchInput = {
  name: string;
  query: Record<string, unknown>;
  alertEnabled: boolean;
};

export type UpdateSavedSearchInput = Partial<CreateSavedSearchInput>;
