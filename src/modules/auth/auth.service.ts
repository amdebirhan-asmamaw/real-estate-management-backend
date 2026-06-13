import { StatusCodes } from 'http-status-codes';
import { User, IUser, canAuthenticate } from './auth.model';
import { AppError } from '../../core/utils/AppError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/utils/jwt';
import type { RegisterInput, LoginInput, RefreshTokenInput } from './auth.validation';
import type { JwtPayload } from '../../core/middleware/auth.middleware';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  kycStatus: string;
  emailVerified: boolean;
}

interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

const buildTokens = (payload: JwtPayload): AuthTokens => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

const toPublicUser = (user: IUser): PublicUser => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  kycStatus: user.kycStatus,
  emailVerified: user.emailVerified,
});

// Translates a non-authenticatable account status into a clear client message.
const blockedMessage = (status: string): string => {
  switch (status) {
    case 'suspended':
      return 'Account is suspended';
    case 'blocked':
      return 'Account is blocked';
    case 'rejected':
      return 'Account verification was rejected';
    default:
      return 'Account cannot sign in';
  }
};

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

  return { user: toPublicUser(user), tokens: buildTokens(payload) };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', StatusCodes.UNAUTHORIZED);
  }

  if (!canAuthenticate(user.accountStatus)) {
    throw new AppError(blockedMessage(user.accountStatus), StatusCodes.FORBIDDEN);
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

  return { user: toPublicUser(user), tokens: buildTokens(payload) };
};

export const refreshTokens = async (input: RefreshTokenInput): Promise<AuthTokens> => {
  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', StatusCodes.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.userId);
  if (!user || !canAuthenticate(user.accountStatus)) {
    throw new AppError('User not found or not allowed to sign in', StatusCodes.UNAUTHORIZED);
  }

  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };

  return buildTokens(payload);
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', StatusCodes.NOT_FOUND);
  }
  return toPublicUser(user);
};
