import Joi from "joi";

export const geocodeQuerySchema = Joi.object({
  q: Joi.string().trim().min(2).max(300).required(),
});

export const reverseGeocodeQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

export const neighborhoodQuerySchema = Joi.object({
  city: Joi.string().max(120),
  country: Joi.string().max(120),
  q: Joi.string().max(120),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export type GeocodeQuery = { q: string };
export type ReverseGeocodeQuery = { lat: number; lng: number };
export type NeighborhoodQuery = {
  city?: string;
  country?: string;
  q?: string;
  page: number;
  limit: number;
};
