import { z } from "zod";
import type { EvidenceMedia } from "~/lib/types";

export const EVIDENCE_CATEGORIES = ["unclassified", "photo", "conversation", "document", "recording", "other"] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];
export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  unclassified: "Non classée", photo: "Photo", conversation: "Conversation", document: "Document", recording: "Enregistrement", other: "Autre",
};
export function evidenceCategoryLabel(value?: string) {
  return EVIDENCE_CATEGORY_LABELS[value as EvidenceCategory] ?? EVIDENCE_CATEGORY_LABELS.unclassified;
}

/** Shared display DTO: ordered application URLs, never object keys or upload identities. */
export function toEvidenceMedia(media: ReadonlyArray<{ id: string; mimeType?: string; evidenceCategory?: string; caption?: string | null; sortOrder?: number }> = []): EvidenceMedia[] {
  return [...media].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id)).map((item, index) => ({
    id: item.id,
    url: `/resources/api/media/${encodeURIComponent(item.id)}`,
    type: item.mimeType?.startsWith("image/") ? "image" : item.mimeType?.startsWith("audio/") ? "audio" : "video",
    altText: `Preuve ${index + 1}`,
    evidenceCategory: item.evidenceCategory,
    caption: item.caption,
  }));
}
export const updateEvidenceSchema = z.object({
  expectedRevision: z.number().int().positive(),
  evidenceCategory: z.enum(EVIDENCE_CATEGORIES).optional(),
  caption: z.string().trim().max(280).nullable().optional().transform((value) => value === "" ? null : value),
  orderedMediaIds: z.array(z.string().uuid()).min(1).max(10).refine((ids) => new Set(ids).size === ids.length).optional(),
}).strict().refine((input) => input.evidenceCategory !== undefined || input.caption !== undefined || input.orderedMediaIds !== undefined, "At least one evidence change is required");
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
