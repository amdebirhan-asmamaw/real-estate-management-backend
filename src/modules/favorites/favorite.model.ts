import { Schema, model, Document, Types } from "mongoose";

export interface IFavorite extends Document {
  user: Types.ObjectId;
  listing: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const favoriteSchema = new Schema<IFavorite>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    listing: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
  },
  { timestamps: true, versionKey: false },
);

// A user can favorite a given listing at most once.
favoriteSchema.index({ user: 1, listing: 1 }, { unique: true });

export const Favorite = model<IFavorite>("Favorite", favoriteSchema);
