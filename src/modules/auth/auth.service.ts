import { StatusCodes } from 'http-status-codes';
import { User } from './auth.model';
import { AppError } from '../../core/utils/AppError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/utils/jwt';
import type { RegisterInput, LoginInput, RefreshTokenInput } from './auth.validation';
import type { JwtPayload } from '../../core/middleware/auth.middleware';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  tokens: AuthTokens;
}

const buildTokens = (payload: JwtPayload): AuthTokens => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError('Email already registered', StatusCodes.CONFLICT);
  }

  const user = await User.create(input);

  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };

  return {
    user: { id: user.id as string, name: user.name, email: user.email, role: user.role },
    tokens: buildTokens(payload),
  };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated', StatusCodes.FORBIDDEN);
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };

  return {
    user: { id: user.id as string, name: user.name, email: user.email, role: user.role },
    tokens: buildTokens(payload),
  };
};

export const refreshTokens = async (input: RefreshTokenInput): Promise<AuthTokens> => {
  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', StatusCodes.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) {
    throw new AppError('User not found or deactivated', StatusCodes.UNAUTHORIZED);
  }

  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };

  return buildTokens(payload);
};

export const getMe = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', StatusCodes.NOT_FOUND);
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
};
