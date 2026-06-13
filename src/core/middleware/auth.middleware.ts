import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// Extend Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError("No token provided", StatusCodes.UNAUTHORIZED));
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return next(new AppError("No token provided", StatusCodes.UNAUTHORIZED));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    next(new AppError("Invalid or expired token", StatusCodes.UNAUTHORIZED));
  }
};

// Like authenticate, but never rejects: attaches req.user when a valid token is
// present and silently continues otherwise. Use for endpoints that are public
// but behave differently for the resource owner (e.g. viewing own draft).
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : undefined;

  if (token) {
    try {
      req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch {
      // Ignore invalid tokens for optional auth.
    }
  }
  next();
};

export const authorize =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          "Forbidden: insufficient permissions",
          StatusCodes.FORBIDDEN,
        ),
      );
    }
    next();
  };
