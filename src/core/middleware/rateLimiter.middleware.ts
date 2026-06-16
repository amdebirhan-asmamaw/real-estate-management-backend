import rateLimit, { Options } from "express-rate-limit";
import { env } from "../config/env";

const baseOptions: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting entirely in tests to keep them deterministic.
  skip: () => env.isTest,
};

/** General limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

/**
 * Stricter limiter for authentication endpoints (login, register,
 * refresh) to slow down credential-stuffing and brute-force attempts.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
});

/**
 * Very strict limiter for password-reset endpoints to prevent email bombing.
 * 5 requests per 15-minute window.
 */
export const passwordResetLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many password reset requests, please try again later.",
  },
});
