import { Schema, model, Document, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  // Auth & account lifecycle
  "auth.registration",
  "auth.password_changed",
  "account.suspended",
  "account.reactivated",
  "account.blocked",
  // KYC
  "kyc.approved",
  "kyc.rejected",
  // Listings
  "listing.review_update",
  "listing.published",
  "listing.rejected",
  "listing.title_minted",
  // Inquiries
  "inquiry.received",
  "inquiry.responded",
  // Offers
  "offer.received",
  "offer.responded",
  // Leases
  "lease.status_update",
  // Compliance
  "compliance.case_update",
  // Purchase transactions
  "purchase.status_update",
  // Rental applications
  "rental_application.received",
  "rental_application.status_update",
  // Saved searches
  "saved_search.match",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 1000 },
    metadata: Schema.Types.Mixed,
    readAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        return ret;
      },
    },
  },
);

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

export const Notification = model<INotification>(
  "Notification",
  notificationSchema,
);
