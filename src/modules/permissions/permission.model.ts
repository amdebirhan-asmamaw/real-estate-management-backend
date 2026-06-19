import { Schema, model, Document } from "mongoose";

/** Dot-namespaced capability key, e.g. `users.suspend`. */
export type PermissionKey = string;

export interface IPermission extends Document {
  key: PermissionKey;
  name: string;
  description?: string;
  /** System permissions are seeded and cannot be deleted. */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IPermission>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/,
        "key must be dot-namespaced (e.g. users.suspend)",
      ],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

export const Permission = model<IPermission>("Permission", permissionSchema);
