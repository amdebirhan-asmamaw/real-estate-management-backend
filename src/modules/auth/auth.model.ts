import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'super_admin' | 'admin' | 'property_owner' | 'tenant';
export const USER_ROLES = ['super_admin', 'admin', 'property_owner', 'tenant'] as const;
export const PUBLIC_REGISTRATION_ROLES = ['property_owner', 'tenant'] as const;

export type AccountStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'blocked'
  | 'rejected';

export type KycStatus = 'not_started' | 'pending' | 'under_review' | 'verified' | 'rejected' | 'expired';

export type KycDocumentType =
  | 'national_id'
  | 'passport'
  | 'drivers_license'
  | 'other';

export type KycDocumentStatus = 'pending' | 'approved' | 'rejected';

export interface IKycDocument {
  _id: Types.ObjectId;
  type: KycDocumentType;
  publicId: string; // Cloudinary "authenticated" id — server-side only
  hash: string; // sha256 of the uploaded file
  status: KycDocumentStatus;
  uploadedAt: Date;
}

export interface IWalletLinkChallenge {
  walletAddress: string;
  nonceHash: string;
  message: string;
  expiresAt: Date;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  profileImage?: string;
  accountStatus: AccountStatus;
  kycStatus: KycStatus;
  emailVerified: boolean;
  mustResetPassword: boolean;
  walletAddress?: string;
  walletStatus: 'unlinked' | 'pending_signature' | 'linked' | 'revoked';
  walletLinkChallenge?: IWalletLinkChallenge;
  kycDocuments: Types.DocumentArray<IKycDocument>;
  kycReviewNote?: string;
  kycVerifiedAt?: Date;
  kycExpiresAt?: Date;
  failedLoginAttempts: number;
  lastFailedLoginAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const kycDocumentSchema = new Schema<IKycDocument>({
  type: {
    type: String,
    enum: ['national_id', 'passport', 'drivers_license', 'other'],
    required: true,
  },
  publicId: { type: String, required: true },
  hash: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  uploadedAt: { type: Date, default: () => new Date() },
});

const walletLinkChallengeSchema = new Schema<IWalletLinkChallenge>(
  {
    walletAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^0x[a-fA-F0-9]{40}$/, 'Please provide a valid wallet address'],
    },
    nonceHash: { type: String, required: true },
    message: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never return password in queries by default
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'property_owner', 'tenant'],
      default: 'tenant',
    },
    // Account lifecycle. Property owners start `pending` (must pass KYC);
    // everyone else starts `active`. Set in the pre-validate hook below.
    accountStatus: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'blocked', 'rejected'],
    },
    kycStatus: {
      type: String,
      enum: ['not_started', 'pending', 'under_review', 'verified', 'rejected', 'expired'],
      default: 'not_started',
    },
    emailVerified: { type: Boolean, default: false },
    mustResetPassword: { type: Boolean, default: false },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    profileImage: { type: String, trim: true },
    // Groundwork for the later "mint to owner wallet" upgrade (custodial today).
    walletAddress: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^0x[a-fA-F0-9]{40}$/, 'Please provide a valid wallet address'],
    },
    walletStatus: {
      type: String,
      enum: ['unlinked', 'pending_signature', 'linked', 'revoked'],
      default: 'unlinked',
    },
    walletLinkChallenge: walletLinkChallengeSchema,
    kycDocuments: { type: [kycDocumentSchema], default: [] },
    kycReviewNote: String,
    kycVerifiedAt: { type: Date },
    kycExpiresAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lastFailedLoginAt: Date,
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        // Private KYC documents are never part of a user's JSON.
        delete ret.kycDocuments;
        delete ret.walletLinkChallenge;
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.failedLoginAttempts;
        delete ret.lastFailedLoginAt;
        return ret;
      },
    },
  }
);

// ─── Defaults that depend on role / wallet ──────────────────────────────────────
userSchema.pre('validate', function (next) {
  if (this.isNew && !this.accountStatus) {
    this.accountStatus = this.role === 'property_owner' ? 'pending' : 'active';
  }
  // Only auto-sync walletStatus for new documents; for existing docs the service
  // sets walletStatus explicitly so we don't want to override pending_signature/revoked.
  if (this.isNew) {
    this.walletStatus = this.walletAddress ? 'linked' : 'unlinked';
  }
  next();
});

// ─── Hash password before save ────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Instance method ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string);
};

// Account statuses that may authenticate (pending users can log in but are
// limited until KYC clears).
export const canAuthenticate = (status: AccountStatus): boolean =>
  status === 'active' || status === 'pending';

export const User = model<IUser>('User', userSchema);
