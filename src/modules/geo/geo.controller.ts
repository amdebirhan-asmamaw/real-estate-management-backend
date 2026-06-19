import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../core/utils/response";
import * as service from "./geo.service";
import type {
  GeocodeQuery,
  NeighborhoodQuery,
  ReverseGeocodeQuery,
} from "./geo.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const geocode: Handler = async (req, res, next) => {
  try {
    const result = await service.geocode(
      (req.query as unknown as GeocodeQuery).q,
    );
    sendSuccess(res, result, "Geocode results");
  } catch (error) {
    next(error);
  }
};

export const reverse: Handler = async (req, res, next) => {
  try {
    const { lat, lng } = req.query as unknown as ReverseGeocodeQuery;
    const result = await service.reverseGeocode(lat, lng);
    sendSuccess(res, result, "Reverse geocode result");
  } catch (error) {
    next(error);
  }
};

export const neighborhoods: Handler = async (req, res, next) => {
  try {
    const result = await service.listNeighborhoods(
      req.query as unknown as NeighborhoodQuery,
    );
    sendSuccess(res, result, "Neighborhoods");
  } catch (error) {
    next(error);
  }
};

export const neighborhoodAnalytics: Handler = async (req, res, next) => {
  try {
    const result = await service.getNeighborhoodAnalytics(req.params.id);
    sendSuccess(res, result, "Neighborhood analytics");
  } catch (error) {
    next(error);
  }
};
