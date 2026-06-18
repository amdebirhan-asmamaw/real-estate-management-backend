import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
  });
};
