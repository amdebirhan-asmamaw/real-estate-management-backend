import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import * as authService from "./auth.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  ChangePasswordInput,
  WalletChallengeInput,
  WalletLinkInput,
  UpdateProfileInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./auth.validation";

// Captures user-agent + IP so sessions are attributable in the session list.
const contextOf = (req: {
  headers: Request["headers"];
  ip?: string;
}): authService.AuthContext => ({
  userAgent: req.headers["user-agent"],
  ip: req.ip,
});

export const register = async (
  req: Request<object, object, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.register(req.body, contextOf(req));
    sendCreated(res, result, "Account created successfully");
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request<object, object, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.login(req.body, contextOf(req));
    sendSuccess(res, result, "Login successful", StatusCodes.OK);
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request<object, object, RefreshTokenInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tokens = await authService.refreshTokens(req.body, contextOf(req));
    sendSuccess(res, tokens, "Tokens refreshed");
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request<object, object, RefreshTokenInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, null, "Logged out");
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.logoutAll(req.user!.userId);
    sendSuccess(res, null, "Logged out of all sessions");
  } catch (error) {
    next(error);
  }
};

export const sessions = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const list = await authService.listSessions(req.user!.userId);
    sendSuccess(res, list, "Active sessions");
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: Request<object, object, ChangePasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.changePassword(
      req.user!.userId,
      req.body.currentPassword,
      req.body.newPassword,
    );
    sendSuccess(res, null, "Password changed; please sign in again");
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: Request<object, object, ForgotPasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.requestPasswordReset(req.body, contextOf(req));
    sendSuccess(
      res,
      null,
      "If the email exists, password reset instructions have been sent",
    );
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request<object, object, ResetPasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await authService.resetPassword(req.body, contextOf(req));
    sendSuccess(res, null, "Password reset successfully; please sign in again");
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.userId);
    sendSuccess(res, user, "Profile fetched");
  } catch (error) {
    next(error);
  }
};

export const walletChallenge = async (
  req: Request<object, object, WalletChallengeInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const challenge = await authService.createWalletChallenge(
      req.user!.userId,
      req.body.walletAddress,
    );
    sendSuccess(res, challenge, "Wallet challenge created");
  } catch (error) {
    next(error);
  }
};

export const linkWallet = async (
  req: Request<object, object, WalletLinkInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await authService.linkWallet(
      req.user!.userId,
      req.body.walletAddress,
      req.body.signature,
    );
    sendSuccess(res, user, "Wallet linked");
  } catch (error) {
    next(error);
  }
};

export const unlinkWallet = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await authService.unlinkWallet(req.user!.userId);
    sendSuccess(res, user, "Wallet unlinked");
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request<object, object, UpdateProfileInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await authService.updateProfile(req.user!.userId, req.body);
    sendSuccess(res, user, "Profile updated");
  } catch (error) {
    next(error);
  }
};
