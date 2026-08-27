import { Prisma, PrismaClient } from "../app/generated/prisma";

/** Fail closed before listening if the web URL can bypass tenant policies. */
export async function verifyRuntimeDatabase(): Promise<void> {
  const client = new PrismaClient({ log: [] });
  try {
    const [role] = await client.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    if (!role || role.rolsuper || role.rolbypassrls) throw new Error("Runtime database role may bypass RLS");
    const models = Object.values(Prisma.ModelName);
    const tables = await client.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; owner: boolean }>>`
      SELECT relname, relrowsecurity, pg_has_role(current_user, relowner, 'MEMBER') AS owner
      FROM pg_class WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r' AND relname IN (${Prisma.join(models)})
    `;
    if (tables.length !== models.length || tables.some((table) => !table.relrowsecurity || table.owner)) {
      throw new Error("Runtime database requires migrated RLS tables and a non-owner role");
    }
    const count = await client.post.count();
    if (count !== 0) throw new Error("Runtime database returned posts without authenticated context");
  } finally {
    await client.$disconnect();
  }
}
