import { PrismaClient } from "~/generated/prisma";

/**
 * Create a privileged client for a migration/maintenance process only.
 *
 * Never import this helper from an HTTP route. SYSTEM_DATABASE_URL must name
 * the table owner or an explicit BYPASSRLS role and should not be present in
 * the web process at all.
 */
export function createSystemPrismaClient(): PrismaClient {
  const datasourceUrl = process.env.SYSTEM_DATABASE_URL?.trim();
  if (!datasourceUrl) {
    throw new Error(
      "SYSTEM_DATABASE_URL is required for privileged database maintenance"
    );
  }
  return new PrismaClient({ datasourceUrl });
}
