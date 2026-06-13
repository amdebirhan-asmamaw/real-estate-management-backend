jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    url: jest.fn(
      (publicId: string) => `https://cdn/signed/${publicId}?__sig=abc`,
    ),
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

  it("destroys by publicId", async () => {
    await expect(destroyAsset("folder/x")).resolves.toBeUndefined();
  });
});
