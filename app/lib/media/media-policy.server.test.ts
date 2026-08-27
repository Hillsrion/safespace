import { describe, expect, it } from "vitest";
import {
  createPrivateStorageKey,
  MediaValidationError,
  sanitizeOriginalFileName,
  sniffMediaMimeType,
  validateMediaBytes,
} from "./media-policy.server";
import { bytesJoin, mp4Box, textBytes } from "./fixtures.server.test-support";

describe("secure media policy", () => {
  it("detects supported formats from magic bytes rather than extensions", () => {
    expect(sniffMediaMimeType(Uint8Array.from([0xff, 0xd8, 0xff, ...new Array(9).fill(0)]))).toBe(
      "image/jpeg"
    );
    expect(
      sniffMediaMimeType(
        Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
      )
    ).toBe("audio/wav");
  });

  it("rejects a declared MIME that disagrees with magic bytes", () => {
    expect(() =>
      validateMediaBytes({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, ...new Array(9).fill(0)]),
        declaredMimeType: "video/mp4",
      })
    ).toThrowError(expect.objectContaining<Partial<MediaValidationError>>({ reason: "mime_mismatch" }));
  });

  it("does not classify arbitrary ISO-BMFF image brands as MP4 video", () => {
    for (const brand of ["avif", "heic", "mif1", "xxxx"]) {
      expect(sniffMediaMimeType(mp4Box("ftyp", bytesJoin(textBytes(brand), new Uint8Array(4))))).toBeNull();
    }
  });

  it("does not classify MPEG Layer I or II as MP3", () => {
    for (const layer of [0xff, 0xfd]) {
      expect(sniffMediaMimeType(Uint8Array.from([255, layer, 0x90, 0x64, ...new Array(12).fill(0)]))).toBeNull();
    }
  });

  it("canonicalizes display names and removes traversal/control characters", () => {
    expect(sanitizeOriginalFileName("../../secret\nphoto.exe", "image/jpeg")).toBe(
      "secretphoto.jpg"
    );
  });

  it("generates unique 256-bit opaque keys with no business identifiers", () => {
    const keys = new Set(Array.from({ length: 40 }, () => createPrivateStorageKey("image/jpeg")));
    expect(keys.size).toBe(40);
    for (const key of keys) {
      expect(key).toMatch(/^evidence\/v1\/[A-Za-z0-9_-]{43}\.jpg$/);
      expect(key).not.toContain("user");
      expect(key).not.toContain("post");
    }
  });
});
