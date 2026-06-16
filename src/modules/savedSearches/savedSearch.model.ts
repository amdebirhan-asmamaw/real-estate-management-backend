import { Schema, model, Document, Types } from "mongoose";

export interface ISavedSearch extends Document {
  user: Types.ObjectId;
  name: string;
  query: Record<string, unknown>;
  alertEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const savedSearchSchema = new Schema<ISavedSearch>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    query: { type: Schema.Types.Mixed, required: true },
    alertEnabled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
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

savedSearchSchema.index({ user: 1, updatedAt: -1 });

export const SavedSearch = model<ISavedSearch>("SavedSearch", savedSearchSchema);
