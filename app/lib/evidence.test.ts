import { describe, expect, it } from "vitest";
import { toEvidenceMedia, updateEvidenceSchema } from "./evidence";

describe("evidence metadata input", () => {
  it("rejects unsafe categories, invalid captions, duplicate orders, and empty patches", () => {
    const base = { expectedRevision: 1, orderedMediaIds: ["11111111-1111-4111-8111-111111111111"] };
    expect(updateEvidenceSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ expectedRevision: 1, evidenceCategory: "unsafe" }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ expectedRevision: 1, caption: "x".repeat(281) }).success).toBe(false);
    expect(updateEvidenceSchema.safeParse({ ...base, orderedMediaIds: [base.orderedMediaIds[0], base.orderedMediaIds[0]] }).success).toBe(false);
  });

  it("shares private, ordered media rendering between feeds and entity profiles without mutating input", () => {
    const media = [
      { id: "b", mimeType: "image/jpeg", sortOrder: 4, caption: "Légende", evidenceCategory: "photo", storageKey: "secret", uploaderId: "private-author", fileName: "name.jpg" },
      { id: "a", mimeType: "audio/mpeg", sortOrder: 1 },
      { id: "c", mimeType: "video/mp4", sortOrder: 4 },
    ];
    const result = toEvidenceMedia(media);
    expect(result.map(({ id, type }) => ({ id, type }))).toEqual([{ id: "a", type: "audio" }, { id: "b", type: "image" }, { id: "c", type: "video" }]);
    expect(media[0].id).toBe("b");
    expect(result[1]).toEqual({ id: "b", type: "image", url: "/resources/api/media/b", altText: "Preuve 2", caption: "Légende", evidenceCategory: "photo" });
    expect(JSON.stringify(result)).not.toMatch(/secret|private-author|name.jpg/);
  });
});
