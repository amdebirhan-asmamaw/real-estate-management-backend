import { Request, Response, NextFunction } from "express";
import Joi from "joi";

type ValidateTarget = "body" | "query" | "params";

export const validate =
  (schema: Joi.ObjectSchema, target: ValidateTarget = "body") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,   // collect all errors, not just the first
      stripUnknown: true,  // remove fields not defined in the schema
    });

    if (error) {
      next(error); // Joi.ValidationError — handled in error.middleware.ts
      return;
    }

    // Replace with validated + stripped data
    req[target] = value;
    next();
  };
