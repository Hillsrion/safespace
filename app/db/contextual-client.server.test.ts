import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "~/generated/prisma";
import { runWithDbContext } from "./context.server";
import {
  createContextualPrismaClient,
  dbContextSql,
} from "./contextual-client.server";

function fakeClient() {
  const transaction = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "viewer" }),
    },
  };
  const base = {
    user: { findUnique: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction)
    ),
  } as unknown as PrismaClient;

  return {
    base,
    transaction,
    client: createContextualPrismaClient(base),
  };
}

describe("contextual Prisma client", () => {
  it("fails closed before a model query when no context exists", async () => {
    const { base, client } = fakeClient();

    await expect(
      client.user.findUnique({ where: { id: "viewer" } })
    ).rejects.toThrow("without an explicit SafeSpace database context");
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it("installs user context with transaction-local PostgreSQL settings", async () => {
    const { base, transaction, client } = fakeClient();
    const where = { id: "76e4d451-7120-49a9-9e3e-0ad7b1981ac1" };

    const result = await runWithDbContext(
      {
        mode: "user",
        userId: where.id,
        isSuperAdmin: true,
      },
      () => client.user.findUnique({ where })
    );

    expect(result).toEqual({ id: "viewer" });
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      dbContextSql,
      where.id,
      "on",
      "user",
      "",
      ""
    );
    expect(transaction.user.findUnique).toHaveBeenCalledWith({ where });
  });

  it("installs registration scope once for an existing callback transaction", async () => {
    const { base, transaction, client } = fakeClient();

    const result = await runWithDbContext(
      {
        mode: "registration",
        email: "member@example.test",
        inviteTokens: ["hashed-token", "legacy-token"],
      },
      () =>
        client.$transaction(async (tx) => {
          expect(tx).toBe(transaction);
          return "registered";
        })
    );

    expect(result).toBe("registered");
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      dbContextSql,
      "",
      "off",
      "registration",
      "member@example.test",
      "hashed-token,legacy-token"
    );
  });

  it("rejects array transactions because their promises cannot share context", async () => {
    const { client } = fakeClient();
    await expect(
      runWithDbContext(
        {
          mode: "user",
          userId: "76e4d451-7120-49a9-9e3e-0ad7b1981ac1",
          isSuperAdmin: false,
        },
        () => client.$transaction([])
      )
    ).rejects.toThrow("only supports callback-form");
  });

  it("also scopes top-level raw operations", async () => {
    const { base, transaction, client } = fakeClient();

    const result = await runWithDbContext(
      {
        mode: "user",
        userId: "76e4d451-7120-49a9-9e3e-0ad7b1981ac1",
        isSuperAdmin: false,
      },
      () => client.$executeRawUnsafe("DELETE FROM impossible WHERE id = $1", 1)
    );

    expect(result).toBe(1);
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      "DELETE FROM impossible WHERE id = $1",
      1
    );
  });
});

describe("RLS migration", () => {
  const migrationPath = resolve(
    process.cwd(),
    "prisma/migrations/20260825120000_add_postgresql_row_level_security/migration.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");
  const outboxSql = readFileSync(
    resolve(
      process.cwd(),
      "prisma/migrations/20260825140000_scope_media_deletion_outbox_rls/migration.sql"
    ),
    "utf8"
  );
  const tables = [
    "User",
    "Space",
    "UserSpaceMembership",
    "Invite",
    "ReportedEntity",
    "ReportedEntityHandle",
    "Post",
    "Media",
    "PostFlag",
    "AuditLog",
    "SavedSearch",
  ];

  it("keeps the contextual delegate registry aligned with every Prisma model", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const delegates = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
      ([, model]) => `${model[0].toLowerCase()}${model.slice(1)}`
    );
    const contextualClientSource = readFileSync(
      resolve(process.cwd(), "app/db/contextual-client.server.ts"),
      "utf8"
    );

    for (const delegate of delegates) {
      expect(contextualClientSource).toContain(`"${delegate}"`);
    }
  });

  it("enables RLS and defines command policies for every Prisma table", () => {
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }

    expect(sql.match(/CREATE POLICY /g)).toHaveLength(tables.length * 4);
    expect(outboxSql).toContain(
      'ALTER TABLE "MediaDeletionJob" ENABLE ROW LEVEL SECURITY'
    );
    expect(outboxSql.match(/CREATE POLICY /g)).toHaveLength(4);
  });

  it("uses transaction-local settings and hardened security-definer helpers", () => {
    expect(dbContextSql).toContain("set_config('safespace.user_id', $1, true)");
    expect(dbContextSql).toContain(
      "set_config('safespace.context_mode', $3, true)"
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(sql).not.toContain("FORCE ROW LEVEL SECURITY");
  });

  it("keeps the durable deletion outbox user-scoped for web requests", () => {
    expect(outboxSql).toContain('"requestedByUserId" = safespace_private.current_user_id()');
    expect(outboxSql).toContain("safespace_private.is_space_member(\"spaceId\")");
    expect(outboxSql).not.toContain("FORCE ROW LEVEL SECURITY");
  });
});
