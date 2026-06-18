import { Schema, model, Document } from "mongoose";

export interface IGeoCache extends Document {
  key: string;
  provider: string;
  query: string;
  result: Record<string, unknown>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface INeighborhood extends Document {
  name: string;
  city?: string;
  region?: string;
  country?: string;
  boundary: { type: "Polygon"; coordinates: number[][][] };
  centroid: { type: "Point"; coordinates: [number, number] };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPOI extends Document {
  name: string;
  category: "school" | "transit" | "healthcare" | "shopping" | "park" | "other";
  location: { type: "Point"; coordinates: [number, number] };
  address?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const geoCacheSchema = new Schema<IGeoCache>(
  {
    key: { type: String, required: true, unique: true, index: true },
    provider: { type: String, required: true, index: true },
    query: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    expiresAt: Date,
  },
  { timestamps: true, versionKey: false },
);

const neighborhoodSchema = new Schema<INeighborhood>(
  {
    name: { type: String, required: true, trim: true, index: true },
    city: { type: String, trim: true, index: true },
    region: { type: String, trim: true },
    country: { type: String, trim: true, index: true },
    boundary: {
      type: { type: String, enum: ["Polygon"], default: "Polygon" },
      coordinates: { type: [[[Number]]], required: true },
    },
    centroid: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true, versionKey: false },
);

const poiSchema = new Schema<IPOI>(
  {
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ["school", "transit", "healthcare", "shopping", "park", "other"],
      required: true,
      index: true,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    address: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true, versionKey: false },
);

neighborhoodSchema.index({ boundary: "2dsphere" });
neighborhoodSchema.index({ centroid: "2dsphere" });
poiSchema.index({ location: "2dsphere" });
geoCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GeoCache = model<IGeoCache>("GeoCache", geoCacheSchema);
export const Neighborhood = model<INeighborhood>(
  "Neighborhood",
  neighborhoodSchema,
);
export const POI = model<IPOI>("POI", poiSchema);
