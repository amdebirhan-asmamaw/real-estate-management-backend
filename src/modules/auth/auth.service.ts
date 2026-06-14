import { randomUUID } from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { User, IUser, canAuthenticate } from './auth.model';
import { RefreshSession, IRefreshSession } from './session.model';
import { AppError } from '../../core/utils/AppError';
import { sha256 } from '../../core/utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpiry,
} from '../../core/utils/jwt';
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

/** Request context captured on a session for auditing/visibility. */
export interface AuthContext {
  userAgent?: string;
  ip?: string;
}

const buildTokens = (payload: JwtPayload): AuthTokens => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

const hashToken = (token: string): string => sha256(Buffer.from(token));

const toPublicUser = (user: IUser): PublicUser => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  kycStatus: user.kycStatus,
  emailVerified: user.emailVerified,
});

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

// Persists a refresh token as a session row (only its hash is stored).
const persistSession = async (
  userId: string,
  refreshToken: string,
  family: string,
  ctx?: AuthContext,
): Promise<void> => {
  await RefreshSession.create({
    user: userId,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt:
      getTokenExpiry(refreshToken) ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    userAgent: ctx?.userAgent,
    ip: ctx?.ip,
  });
};

const issueSession = async (
  user: IUser,
  ctx?: AuthContext,
): Promise<AuthTokens> => {
  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };
  const tokens = buildTokens(payload);
  await persistSession(user.id as string, tokens.refreshToken, randomUUID(), ctx);
  return tokens;
};

export const register = async (
  input: RegisterInput,
  ctx?: AuthContext,
): Promise<AuthResult> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError('Email already registered', StatusCodes.CONFLICT);
  }

  const user = await User.create(input);
  const tokens = await issueSession(user, ctx);
  return { user: toPublicUser(user), tokens };
};

export const login = async (
  input: LoginInput,
  ctx?: AuthContext,
): Promise<AuthResult> => {
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

  const tokens = await issueSession(user, ctx);
  return { user: toPublicUser(user), tokens };
};

/**
 * Verifies the refresh token, looks up its session, and rotates it: the
 * presented token is revoked and a fresh pair is issued in the same family.
 * Presenting an already-revoked token (token reuse) revokes the whole family.
 */
export const refreshTokens = async (
  input: RefreshTokenInput,
  ctx?: AuthContext,
): Promise<AuthTokens> => {
  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', StatusCodes.UNAUTHORIZED);
  }

  const session = await RefreshSession.findOne({
    tokenHash: hashToken(input.refreshToken),
  });
  if (!session) {
    throw new AppError('Session not found', StatusCodes.UNAUTHORIZED);
  }
  if (session.revokedAt) {
    // Reuse of a rotated token — revoke every live token in the family.
    await RefreshSession.updateMany(
      { family: session.family, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
    throw new AppError('Refresh token reuse detected', StatusCodes.UNAUTHORIZED);
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new AppError('Session expired', StatusCodes.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.userId);
  if (!user || !canAuthenticate(user.accountStatus)) {
    throw new AppError('User not found or not allowed to sign in', StatusCodes.UNAUTHORIZED);
  }

  // Rotate: revoke the presented session, issue a new one in the same family.
  session.revokedAt = new Date();
  await session.save();

  const payload: JwtPayload = {
    userId: user.id as string,
    email: user.email,
    role: user.role,
  };
  const tokens = buildTokens(payload);
  await persistSession(user.id as string, tokens.refreshToken, session.family, {
    userAgent: ctx?.userAgent ?? session.userAgent,
    ip: ctx?.ip ?? session.ip,
  });
  return tokens;
};

/** Revokes the session for a single refresh token (idempotent). */
export const logout = async (refreshToken: string): Promise<void> => {
  await RefreshSession.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
};

/** Revokes every active session for a user. */
export const logoutAll = async (userId: string): Promise<void> => {
  await RefreshSession.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
};

export interface SessionSummary {
  id: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  expiresAt: Date;
}

/** Lists a user's active (non-revoked, non-expired) sessions. */
export const listSessions = async (userId: string): Promise<SessionSummary[]> => {
  const sessions = await RefreshSession.find({
    user: userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  return sessions.map((s: IRefreshSession) => ({
    id: s.id as string,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
};

/** Verifies the current password, sets a new one, and revokes all sessions. */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AppError('User not found', StatusCodes.NOT_FOUND);
  }
  const ok = await user.comparePassword(currentPassword);
  if (!ok) {
    throw new AppError('Current password is incorrect', StatusCodes.UNAUTHORIZED);
  }
  user.password = newPassword; // hashed by the pre-save hook
  await user.save();
  await logoutAll(userId);
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', StatusCodes.NOT_FOUND);
  }
  return toPublicUser(user);
};
