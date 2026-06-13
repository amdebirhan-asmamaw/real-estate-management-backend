import { createHash } from "crypto";

/** sha256 hex digest of a buffer — used to fingerprint ownership documents. */
export const sha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");
