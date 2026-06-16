import { Schema, model, Document, Types } from "mongoose";

export type ListingEventType =
  | "view"
  | "favorite"
  | "inquiry"
  | "offer"
  | "rental_application";

export interface IListingEvent extends Document {
  listing: Types.ObjectId;
  owner: Types.ObjectId;
  actor?: Types.ObjectId;
  eventType: ListingEventType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const listingEventSchema = new Schema<IListingEvent>(
  {
    listing: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    eventType: {
      type: String,
      enum: ["view", "favorite", "inquiry", "offer", "rental_application"],
      required: true,
      index: true,
    },
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

listingEventSchema.index({ listing: 1, eventType: 1, createdAt: -1 });
listingEventSchema.index({ owner: 1, createdAt: -1 });

export const ListingEvent = model<IListingEvent>("ListingEvent", listingEventSchema);
