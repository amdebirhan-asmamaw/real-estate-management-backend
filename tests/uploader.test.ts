jest.mock("../src/core/config/env", () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret",
    SIGNED_URL_TTL_SECONDS: 300,
  },
}));

const mockCloudinaryUrl = jest.fn(
  (publicId: string, opts: Record<string, unknown>) =>
    `https://cdn/signed/${publicId}?__sig=abc&expires_at=${opts.expires_at ?? ""}`,
);

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    url: mockCloudinaryUrl,
    uploader: {
      upload_stream: (
        _opts: unknown,
        cb: (e: unknown, r: unknown) => void,
      ) => ({
        end: () =>
          cb(null, {
            secure_url: "https://cdn/x.jpg",
            public_id: "folder/x",
          }),
      }),
      destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

import {
  uploadPublic,
  uploadPrivate,
  signedUrl,
  destroyAsset,
} from "../src/core/utils/uploader";
import { sha256 } from "../src/core/utils/hash";

describe("hash", () => {
  it("computes a stable sha256 hex digest", () => {
    expect(sha256(Buffer.from("hello"))).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("uploader", () => {
  it("uploads a public image and returns url + publicId", async () => {
    const result = await uploadPublic(Buffer.from("data"), "photos");
    expect(result).toEqual({ url: "https://cdn/x.jpg", publicId: "folder/x" });
  });

  it("uploads a private document and returns only the publicId (no public url)", async () => {
    const result = await uploadPrivate(Buffer.from("data"), "docs");
    expect(result.publicId).toBe("folder/x");
    expect(result).not.toHaveProperty("url");
  });

  it("mints a signed URL for a private asset", () => {
    expect(signedUrl("folder/x")).toContain("__sig=");
  });

  it("passes expires_at to cloudinary.url so the signed URL has an explicit expiry", () => {
    const before = Math.floor(Date.now() / 1000);
    signedUrl("folder/x");
    const after = Math.floor(Date.now() / 1000);

    // The last call to cloudinary.url must have received expires_at.
    const lastCall = mockCloudinaryUrl.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const opts = lastCall![1] as Record<string, unknown>;
    expect(typeof opts.expires_at).toBe("number");

    // expires_at should be roughly now + 300 s (SIGNED_URL_TTL_SECONDS).
    const expiresAt = opts.expires_at as number;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 300);
    expect(expiresAt).toBeLessThanOrEqual(after + 300);
  });

  it("destroys by publicId", async () => {
    await expect(destroyAsset("folder/x")).resolves.toBeUndefined();
  });
});
