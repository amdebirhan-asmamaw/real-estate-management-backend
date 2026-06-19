import { randomBytes, randomUUID } from "crypto";
import { StatusCodes } from "http-status-codes";
import { getAddress, verifyMessage } from "ethers";
import { User, IUser, canAuthenticate } from "./auth.model";
import { RefreshSession, IRefreshSession } from "./session.model";
import { PasswordResetToken } from "./passwordResetToken.model";
import { AppError } from "../../core/utils/AppError";
import { sha256 } from "../../core/utils/hash";
import { sendPasswordResetEmail } from "../../core/utils/mailer";
import { env } from "../../core/config/env";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpiry,
} from "../../core/utils/jwt";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import { Lease } from "../leases/lease.model";
import type {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  UpdateProfileInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./auth.validation";
import type { JwtPayload } from "../../core/middleware/auth.middleware";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  profileImage?: string;
  accountStatus: string;
  kycStatus: string;
  emailVerified: boolean;
  walletAddress?: string;
  walletStatus: string;
  mustResetPassword: boolean;
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
const hashNonce = (nonce: string): string => sha256(Buffer.from(nonce));

const normalizeWalletAddress = (walletAddress: string): string => {
  try {
    return getAddress(walletAddress).toLowerCase();
  } catch {
    throw new AppError("Invalid wallet address", StatusCodes.BAD_REQUEST);
  }
};

const buildResetUrl = (token: string): string => {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
};

const toPublicUser = (user: IUser): PublicUser => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  profileImage: user.profileImage,
  accountStatus: user.accountStatus,
  kycStatus: user.kycStatus,
  emailVerified: user.emailVerified,
  walletAddress: user.walletAddress,
  walletStatus: user.walletStatus,
  mustResetPassword: user.mustResetPassword,
});

const blockedMessage = (status: string): string => {
  switch (status) {
    case "suspended":
      return "Account is suspended";
    case "blocked":
      return "Account is blocked";
    case "rejected":
      return "Account verification was rejected";
    default:
      return "Account cannot sign in";
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
  await persistSession(
    user.id as string,
    tokens.refreshToken,
    randomUUID(),
    ctx,
  );
  return tokens;
};

export const register = async (
  input: RegisterInput,
  ctx?: AuthContext,
): Promise<AuthResult> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError("Email already registered", StatusCodes.CONFLICT);
  }

  const user = await User.create(input);
  const tokens = await issueSession(user, ctx);

  await audit.record({
    actor: user.id as string,
    actorRole: user.role,
    action: "user.registered",
    targetType: "user",
    targetId: user.id as string,
    metadata: { role: user.role, ip: ctx?.ip },
  });

  await notifications.notify({
    recipient: user.id as string,
    type: "auth.registration",
    title: "Welcome to the platform",
    message: `Your ${user.role.replace("_", " ")} account has been created successfully.`,
  });

  return { user: toPublicUser(user), tokens };
};

export const login = async (
  input: LoginInput,
  ctx?: AuthContext,
): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email }).select(
    "+password +lockedUntil",
  );
  if (!user) {
    throw new AppError("Invalid email or password", StatusCodes.UNAUTHORIZED);
  }

  if (!canAuthenticate(user.accountStatus)) {
    await audit.record({
      actor: user.id as string,
      actorRole: user.role,
      action: "user.login_failed",
      targetType: "user",
      targetId: user.id as string,
      metadata: {
        reason: "account_status",
        status: user.accountStatus,
        ip: ctx?.ip,
      },
    });
    throw new AppError(
      blockedMessage(user.accountStatus),
      StatusCodes.FORBIDDEN,
    );
  }

  // ── Account lockout check ────────────────────────────────────────────────
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit.record({
      actor: user.id as string,
      actorRole: user.role,
      action: "user.login_failed",
      targetType: "user",
      targetId: user.id as string,
      metadata: { reason: "account_locked", ip: ctx?.ip },
    });
    throw new AppError(
      "Account is temporarily locked due to too many failed login attempts. Please try again later.",
      423, // HTTP 423 Locked
    );
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    user.failedLoginAttempts = attempts;
    user.lastFailedLoginAt = new Date();

    // Lock the account when the threshold is reached (MAX_LOGIN_ATTEMPTS > 0).
    if (env.MAX_LOGIN_ATTEMPTS > 0 && attempts >= env.MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(
        Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000,
      );
    }

    await user.save();

    await audit.record({
      actor: user.id as string,
      actorRole: user.role,
      action: "user.login_failed",
      targetType: "user",
      targetId: user.id as string,
      metadata: {
        reason: "bad_password",
        attempts: user.failedLoginAttempts,
        ip: ctx?.ip,
      },
    });

    throw new AppError("Invalid email or password", StatusCodes.UNAUTHORIZED);
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = undefined;
    user.lockedUntil = undefined;
    await user.save();
  }

  const tokens = await issueSession(user, ctx);

  await audit.record({
    actor: user.id as string,
    actorRole: user.role,
    action: "user.logged_in",
    targetType: "user",
    targetId: user.id as string,
    metadata: { ip: ctx?.ip, userAgent: ctx?.userAgent },
  });

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
    throw new AppError(
      "Invalid or expired refresh token",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const session = await RefreshSession.findOne({
    tokenHash: hashToken(input.refreshToken),
  });
  if (!session) {
    throw new AppError("Session not found", StatusCodes.UNAUTHORIZED);
  }
  if (session.revokedAt) {
    await RefreshSession.updateMany(
      { family: session.family, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
    throw new AppError(
      "Refresh token reuse detected",
      StatusCodes.UNAUTHORIZED,
    );
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new AppError("Session expired", StatusCodes.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.userId);
  if (!user || !canAuthenticate(user.accountStatus)) {
    throw new AppError(
      "User not found or not allowed to sign in",
      StatusCodes.UNAUTHORIZED,
    );
  }

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
export const listSessions = async (
  userId: string,
): Promise<SessionSummary[]> => {
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
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }
  const ok = await user.comparePassword(currentPassword);
  if (!ok) {
    throw new AppError(
      "Current password is incorrect",
      StatusCodes.UNAUTHORIZED,
    );
  }
  const samePassword = await user.comparePassword(newPassword);
  if (samePassword) {
    throw new AppError(
      "New password must differ from current password",
      StatusCodes.BAD_REQUEST,
    );
  }
  user.password = newPassword;
  user.mustResetPassword = false;
  await user.save();
  await logoutAll(userId);
};

// ─── Forgot / Reset Password ───────────────────────────────────────────────────

export const requestPasswordReset = async (
  input: ForgotPasswordInput,
  ctx?: AuthContext,
): Promise<void> => {
  const user = await User.findOne({ email: input.email });
  if (!user || !canAuthenticate(user.accountStatus)) {
    return;
  }

  await PasswordResetToken.updateMany(
    { user: user._id, usedAt: { $exists: false } },
    { usedAt: new Date() },
  );

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000,
  );

  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  await sendPasswordResetEmail(
    user.email,
    buildResetUrl(rawToken),
    env.PASSWORD_RESET_EXPIRES_MINUTES,
  );

  await audit.record({
    actor: user.id as string,
    actorRole: user.role,
    action: "user.password_reset_requested",
    targetType: "user",
    targetId: user.id as string,
    metadata: { ip: ctx?.ip, userAgent: ctx?.userAgent },
  });
};

export const resetPassword = async (
  input: ResetPasswordInput,
  ctx?: AuthContext,
): Promise<void> => {
  // Atomic find-and-consume to prevent race conditions with concurrent requests
  const token = await PasswordResetToken.findOneAndUpdate(
    {
      tokenHash: hashToken(input.token),
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { usedAt: new Date() },
    { new: true },
  );

  if (!token) {
    throw new AppError(
      "Invalid or expired password reset token",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const user = await User.findById(token.user).select("+password");
  if (!user || !canAuthenticate(user.accountStatus)) {
    throw new AppError(
      "Invalid or expired password reset token",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const samePassword = await user.comparePassword(input.newPassword);
  if (samePassword) {
    throw new AppError(
      "New password must differ from current password",
      StatusCodes.BAD_REQUEST,
    );
  }

  user.password = input.newPassword;
  user.mustResetPassword = false;
  await user.save();
  await logoutAll(user.id as string);

  await audit.record({
    actor: user.id as string,
    actorRole: user.role,
    action: "user.password_reset",
    targetType: "user",
    targetId: user.id as string,
    metadata: { ip: ctx?.ip, userAgent: ctx?.userAgent },
  });

  await notifications.notify({
    recipient: user.id as string,
    type: "auth.password_changed",
    title: "Password reset complete",
    message:
      "Your password has been reset. If you did not do this, contact support immediately.",
  });
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }
  return toPublicUser(user);
};

export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new AppError("Name cannot be empty", StatusCodes.BAD_REQUEST);
    }
    user.name = trimmed;
  }
  if (input.phone !== undefined) user.phone = input.phone?.trim() || undefined;
  if (input.profileImage !== undefined)
    user.profileImage = input.profileImage?.trim() || undefined;
  await user.save();

  await audit.record({
    actor: userId,
    actorRole: user.role,
    action: "user.profile_updated",
    targetType: "user",
    targetId: userId,
    metadata: { fields: Object.keys(input) },
  });

  return toPublicUser(user);
};

export interface WalletChallenge {
  walletAddress: string;
  message: string;
  expiresAt: Date;
}

const buildWalletLinkMessage = (
  user: IUser,
  walletAddress: string,
  nonce: string,
  expiresAt: Date,
): string =>
  [
    "Real Estate Marketplace wallet linking",
    "",
    `User: ${user.id}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join("\n");

export const createWalletChallenge = async (
  userId: string,
  walletAddress: string,
): Promise<WalletChallenge> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  const normalized = normalizeWalletAddress(walletAddress);
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const message = buildWalletLinkMessage(user, normalized, nonce, expiresAt);

  user.walletLinkChallenge = {
    walletAddress: normalized,
    nonceHash: hashNonce(nonce),
    message,
    expiresAt,
  };
  user.walletStatus = "pending_signature";
  await user.save();

  return { walletAddress: normalized, message, expiresAt };
};

export const linkWallet = async (
  userId: string,
  walletAddress: string,
  signature: string,
): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  const normalized = normalizeWalletAddress(walletAddress);
  const challenge = user.walletLinkChallenge;
  if (!challenge) {
    throw new AppError("No active wallet challenge", StatusCodes.CONFLICT);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    user.walletLinkChallenge = undefined;
    await user.save();
    throw new AppError("Wallet challenge expired", StatusCodes.CONFLICT);
  }
  if (challenge.walletAddress !== normalized) {
    throw new AppError(
      "Wallet address does not match the active challenge",
      StatusCodes.CONFLICT,
    );
  }

  let recovered: string;
  try {
    recovered = verifyMessage(challenge.message, signature).toLowerCase();
  } catch {
    throw new AppError("Invalid wallet signature", StatusCodes.UNAUTHORIZED);
  }
  if (recovered !== normalized) {
    throw new AppError(
      "Wallet signature does not match walletAddress",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const existing = await User.findOne({
    _id: { $ne: user._id },
    walletAddress: normalized,
  });
  if (existing) {
    throw new AppError(
      "Wallet address is already linked to another account",
      StatusCodes.CONFLICT,
    );
  }

  user.walletAddress = normalized;
  user.walletStatus = "linked";
  user.walletLinkChallenge = undefined;
  await user.save();

  await audit.record({
    actor: userId,
    actorRole: user.role,
    action: "user.wallet_linked",
    targetType: "user",
    targetId: userId,
    metadata: { walletAddress: normalized },
  });

  await notifications.notify({
    recipient: userId,
    type: "auth.registration",
    title: "Wallet linked",
    message: `Your wallet (${normalized.slice(0, 6)}…${normalized.slice(-4)}) has been linked to your account.`,
    metadata: { walletAddress: normalized },
  });

  return toPublicUser(user);
};

export const unlinkWallet = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  const activeLease = await Lease.findOne({
    $or: [{ landlord: userId }, { tenant: userId }],
    status: { $in: ["proposed", "active", "disputed"] },
    "escrow.state": { $in: ["funded", "active"] },
  });
  if (activeLease) {
    throw new AppError(
      "Cannot unlink wallet while you have active or funded lease escrows",
      StatusCodes.CONFLICT,
    );
  }

  user.walletAddress = undefined;
  user.walletStatus = "unlinked";
  user.walletLinkChallenge = undefined;
  await user.save();

  await audit.record({
    actor: userId,
    actorRole: user.role,
    action: "user.wallet_unlinked",
    targetType: "user",
    targetId: userId,
  });

  return toPublicUser(user);
};

/**
 * Admin / security path — revokes a wallet link. Clears the address and
 * challenge like unlinkWallet but marks status `revoked` rather than `unlinked`,
 * making it distinguishable in audit trails. Blocked by active escrow guards
 * identical to unlinkWallet.
 */
export const revokeWallet = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", StatusCodes.NOT_FOUND);
  }

  // Guard: prevent revoking while user is party to active/funded leases.
  const activeLease = await Lease.findOne({
    $or: [{ landlord: userId }, { tenant: userId }],
    status: { $in: ["proposed", "active", "disputed"] },
    "escrow.state": { $in: ["funded", "active"] },
  });
  if (activeLease) {
    throw new AppError(
      "Cannot revoke wallet while user has active or funded lease escrows",
      StatusCodes.CONFLICT,
    );
  }

  user.walletAddress = undefined;
  user.walletStatus = "revoked";
  user.walletLinkChallenge = undefined;
  await user.save();

  await audit.record({
    actor: userId,
    actorRole: user.role,
    action: "user.wallet_revoked",
    targetType: "user",
    targetId: userId,
    metadata: { reason: "revoked" },
  });

  return toPublicUser(user);
};
