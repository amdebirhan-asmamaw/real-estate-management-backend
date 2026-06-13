import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as authService from './auth.service';
import { sendSuccess, sendCreated } from '../../core/utils/response';
import type { RegisterInput, LoginInput, RefreshTokenInput } from './auth.validation';

export const register = async (
  req: Request<object, object, RegisterInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.register(req.body);
    sendCreated(res, result, 'Account created successfully');
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request<object, object, LoginInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result, 'Login successful', StatusCodes.OK);
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request<object, object, RefreshTokenInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tokens = await authService.refreshTokens(req.body);
    sendSuccess(res, tokens, 'Tokens refreshed');
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.userId);
    sendSuccess(res, user, 'Profile fetched');
  } catch (error) {
    next(error);
  }
};
