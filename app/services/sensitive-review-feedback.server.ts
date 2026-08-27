import { z } from "zod";
import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";

const feedbackSchema = z.object({
  revision: z.number().int().positive(),
  status: z.enum(["pending", "changes_requested", "approved", "superseded", "blocked"]),
  corrections: z.array(z.object({ stage: z.number().int().min(1).max(3), note: z.string(), createdAt: z.string() }).strict()),
}).strict().nullable();

/** SQL checks current session authorship and visibility; never accepts an actor override. */
export async function getOwnSensitiveReviewFeedback(postId: string, client: PrismaClient = prisma) {
  const [row] = await client.$queryRaw<Array<{ feedback: unknown }>>`
    SELECT safespace_private.own_sensitive_review_feedback(${postId}::uuid) AS feedback
  `;
  return feedbackSchema.parse(row?.feedback ?? null);
}
