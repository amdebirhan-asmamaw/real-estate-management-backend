import { v2 as cloudinary } from "cloudinary";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "./AppError";

let configured = false;

const ensureConfigured = (): void => {
  if (configured) return;
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new AppError(
      "Media uploads are not configured",
      StatusCodes.SERVICE_UNAVAILABLE,
    );
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  configured = true;
};

interface RawUpload {
  secure_url: string;
  public_id: string;
}

const streamUpload = (
  buffer: Buffer,
  options: Record<string, unknown>,
): Promise<RawUpload> => {
  ensureConfigured();
  return new Promise<RawUpload>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve(result as unknown as RawUpload);
      },
    );
    stream.end(buffer);
  });
};

export interface PublicUpload {
  url: string;
  publicId: string;
}

/** Uploads a publicly-served image (e.g. listing photos). */
export const uploadPublic = async (
  buffer: Buffer,
  folder: string,
): Promise<PublicUpload> => {
  const result = await streamUpload(buffer, {
    folder,
    resource_type: "image",
    type: "upload",
  });
  return { url: result.secure_url, publicId: result.public_id };
};

export interface PrivateUpload {
  publicId: string;
}

/**
 * Uploads a private (Cloudinary "authenticated") asset — e.g. ownership
 * documents. No public URL is returned or stored; access is only ever granted
 * via a short-lived signed URL from `signedUrl`.
 */
export const uploadPrivate = async (
  buffer: Buffer,
  folder: string,
): Promise<PrivateUpload> => {
  const result = await streamUpload(buffer, {
    folder,
    resource_type: "image",
    type: "authenticated",
  });
  return { publicId: result.public_id };
};

/** Mints a signed delivery URL for a private (authenticated) asset. */
export const signedUrl = (publicId: string): string => {
  ensureConfigured();
  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: "image",
    sign_url: true,
    secure: true,
  });
};

/** Permanently removes an asset by its publicId. */
export const destroyAsset = async (
  publicId: string,
  type: "upload" | "authenticated" = "upload",
): Promise<void> => {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { type });
};
