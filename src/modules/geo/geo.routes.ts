import { Router } from "express";
import * as controller from "./geo.controller";
import { validate } from "../../core/middleware/validate.middleware";
import {
  geocodeQuerySchema,
  neighborhoodQuerySchema,
  reverseGeocodeQuerySchema,
} from "./geo.validation";

export const geoRouter = Router();

geoRouter.get(
  "/geocode",
  validate(geocodeQuerySchema, "query"),
  controller.geocode,
);
geoRouter.get(
  "/reverse",
  validate(reverseGeocodeQuerySchema, "query"),
  controller.reverse,
);
geoRouter.get(
  "/neighborhoods",
  validate(neighborhoodQuerySchema, "query"),
  controller.neighborhoods,
);
geoRouter.get("/neighborhoods/:id/analytics", controller.neighborhoodAnalytics);
