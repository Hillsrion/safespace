import { z } from "zod";

const note = z.string().trim().min(10).max(2000);
const revision = z.number().int().positive();
export const sensitiveReviewDecisionSchema = z.object({
  revision,
  stage: z.number().int().min(1).max(3),
  outcome: z.enum(["approve", "request_changes"]),
  note,
}).strict();
export const requireSensitiveReviewSchema = z.object({ revision, reason: note }).strict();
export const sensitiveReviewPathSchema = z.object({ spaceId: z.string().uuid(), postId: z.string().uuid() });
export const sensitiveReviewQuerySchema = z.object({
  classification: z.enum(["required", "unclassified"]).default("required"),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export type SensitiveReviewDecisionInput = z.infer<typeof sensitiveReviewDecisionSchema>;
export type RequireSensitiveReviewInput = z.infer<typeof requireSensitiveReviewSchema>;
export type SensitiveReviewQuery = z.infer<typeof sensitiveReviewQuerySchema>;
export const SENSITIVE_REVIEW_STAGES = ["Modérateur de l’espace", "Administrateur de l’espace", "Superadministrateur"] as const;
export const SENSITIVE_REVIEW_STATUSES = {
  pending: "Revue en cours",
  changes_requested: "Correction demandée",
  approved: "Revue interne à trois niveaux terminée",
  superseded: "Révision remplacée",
  blocked: "Revue impossible : auteur détaché",
} as const;
