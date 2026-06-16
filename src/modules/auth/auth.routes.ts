import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../core/middleware/validate.middleware';
import { authenticate } from '../../core/middleware/auth.middleware';
import { authLimiter } from '../../core/middleware/rateLimiter.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  walletChallengeSchema,
  walletLinkSchema,
} from './auth.validation';

export const authRouter = Router();

// Public routes (rate-limited to deter brute-force / credential stuffing)
authRouter.post('/register', authLimiter, validate(registerSchema), authController.register);
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login);
authRouter.post('/refresh-token', authLimiter, validate(refreshTokenSchema), authController.refreshToken);
authRouter.post('/logout', validate(refreshTokenSchema), authController.logout);

// Protected routes
authRouter.get('/me', authenticate, authController.getMe);
authRouter.get('/sessions', authenticate, authController.sessions);
authRouter.post('/logout-all', authenticate, authController.logoutAll);
authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);
authRouter.post(
  '/wallet/challenge',
  authenticate,
  validate(walletChallengeSchema),
  authController.walletChallenge
);
authRouter.post(
  '/wallet/link',
  authenticate,
  validate(walletLinkSchema),
  authController.linkWallet
);
authRouter.delete('/wallet', authenticate, authController.unlinkWallet);
