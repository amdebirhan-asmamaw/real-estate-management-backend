import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import Joi from "joi";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
    return;
  }

  // Joi validation errors
  if (Joi.isError(err)) {
    res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: "Validation error",
      errors: (err as Joi.ValidationError).details.map((d) => ({
        field: d.path.join("."),
        message: d.message.replace(/"/g, ""),
      })),
    });
    return;
  }

  // Mongoose/MongoDB duplicate key error (code 11000)
  if (
    err.name === "MongoServerError" &&
    (err as Error & { code?: number }).code === 11000
  ) {
    const keyValue = (err as Error & { keyValue?: Record<string, unknown> })
      .keyValue;
    const field = keyValue ? Object.keys(keyValue)[0] : undefined;
    res.status(StatusCodes.CONFLICT).json({
      success: false,
      message: field
        ? `A record with this ${field} already exists`
        : "Duplicate field value",
    });
    return;
  }

  // Mongoose schema validation error
  if (err.name === "ValidationError") {
    res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: "Validation error",
      errors: Object.values(
        (err as Error & { errors?: Record<string, { message: string }> })
          .errors ?? {},
      ).map((e) => e.message),
    });
    return;
  }

  // Mongoose cast error
  if (err.name === "CastError") {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "Invalid ID format",
    });
    return;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: "Invalid token",
    });
    return;
  }

  if (err.name === "TokenExpiredError") {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: "Token expired",
    });
    return;
  }

  // Unknown/programmer errors — log and return generic message
  logger.error("Unhandled error:", err);

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal server error",
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
