/**
 * PostgreSQL query-plan regression test for the authenticated search core.
 * It seeds synthetic rows only after explicit disposable-test opt-in, verifies
 * the production predicates with EXPLAIN ANALYZE, then removes every fixture.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../app/generated/prisma";
import { buildEntitySearchQuery, buildPostSearchQuery } from "../app/lib/search-query";

type PlanNode = {
  "Node Type"?: string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
};

type ExplainDocument = {
  Plan: PlanNode;
  "Execution Time": number;
};

type ExplainRow = {
  "QUERY PLAN": ExplainDocument[] | string;
};

const fixtureSize = 20_000;
const maximumExecutionTimeMs = 2_000;
const runId = randomBytes(8).toString("hex");
const ids = {
  user: randomUUID(),
  space: randomUUID(),
};

function walkPlan(node: PlanNode, visit: (node: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) walkPlan(child, visit);
}

function parsePlan(row: ExplainRow | undefined): ExplainDocument {
  assert.ok(row, "EXPLAIN returned no plan");
  const value = typeof row["QUERY PLAN"] === "string"
    ? JSON.parse(row["QUERY PLAN"])
    : row["QUERY PLAN"];
  assert.ok(Array.isArray(value) && value.length === 1, "EXPLAIN returned an unexpected JSON shape");
  return value[0];
}

function inspectPlan(
  label: string,
  document: ExplainDocument,
  expectedIndexes: string[],
  protectedRelations: string[],
): { indexes: string[]; executionTimeMs: number } {
  const indexes = new Set<string>();
  const sequentialScans: string[] = [];
  walkPlan(document.Plan, (node) => {
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    if (
      node["Node Type"] === "Seq Scan"
      && node["Relation Name"]
      && protectedRelations.includes(node["Relation Name"])
    ) {
      sequentialScans.push(node["Relation Name"]);
    }
  });

  assert.deepEqual(
    expectedIndexes.filter((index) => !indexes.has(index)),
    [],
    `${label} did not use every expected index`,
  );
  assert.deepEqual(sequentialScans, [], `${label} fell back to a sequential scan`);
  assert.ok(
    document["Execution Time"] <= maximumExecutionTimeMs,
    `${label} exceeded ${maximumExecutionTimeMs}ms (${document["Execution Time"]}ms)`,
  );
  return {
    indexes: [...indexes].filter((index) => expectedIndexes.includes(index)).sort(),
    executionTimeMs: document["Execution Time"],
  };
}

async function main(): Promise<void> {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required");
  assert.equal(
    process.env.SEARCH_PERF_TEST_ALLOW_SETUP,
    "1",
    "SEARCH_PERF_TEST_ALLOW_SETUP=1 is required for a disposable database",
  );
  const databaseUrl = process.env.SEARCH_PERF_TEST_DATABASE_URL;
  const expectedDatabase = process.env.SEARCH_PERF_TEST_DATABASE_NAME;
  assert.ok(databaseUrl, "SEARCH_PERF_TEST_DATABASE_URL is required; DATABASE_URL is not used");
  assert.ok(expectedDatabase, "SEARCH_PERF_TEST_DATABASE_NAME is required");
  const parsedUrl = new URL(databaseUrl);
  assert.ok(["postgres:", "postgresql:"].includes(parsedUrl.protocol), "PostgreSQL URL required");
  assert.equal(
    decodeURIComponent(parsedUrl.pathname.slice(1)),
    expectedDatabase,
    "the explicit database name must match the URL",
  );

  const admin = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  let userCreated = false;
  let spaceCreated = false;
  try {
    const [{ database }] = await admin.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    assert.equal(database, expectedDatabase, "connected to an unexpected database");

    await admin.user.create({
      data: {
        id: ids.user,
        email: `search-plan-${runId}@example.test`,
        password: "synthetic-performance-fixture-not-a-password-hash",
        firstName: "Search",
        lastName: "Fixture",
      },
    });
    userCreated = true;
    await admin.space.create({
      data: {
        id: ids.space,
        name: `Search plan ${runId}`,
        createdBy: ids.user,
        memberships: { create: { userId: ids.user, role: "ADMIN" } },
      },
    });
    spaceCreated = true;

    await admin.$executeRaw(Prisma.sql`
      INSERT INTO "ReportedEntity" (
        id, name, "spaceId", "addedByUserId", "updatedAt"
      )
      SELECT
        md5(${runId} || ':entity:' || item::text)::uuid,
        CASE WHEN item % 1000 = 0
          THEN 'Needle Person ' || item
          ELSE 'Common Entity ' || item
        END,
        ${ids.space}::uuid,
        ${ids.user}::uuid,
        now() - (item || ' seconds')::interval
      FROM generate_series(1, ${fixtureSize}) AS item
    `);
    await admin.$executeRaw(Prisma.sql`
      INSERT INTO "ReportedEntityHandle" (
        id, "reportedEntityId", handle, platform
      )
      SELECT
        md5(${runId} || ':handle:' || item::text)::uuid,
        md5(${runId} || ':entity:' || item::text)::uuid,
        CASE WHEN item % 1200 = 0
          THEN 'needle_handle_' || item
          ELSE 'ordinary_handle_' || item
        END,
        'Instagram'
      FROM generate_series(1, ${fixtureSize}) AS item
    `);
    await admin.$executeRaw(Prisma.sql`
      INSERT INTO "Post" (
        id, "spaceId", "authorId", "reportedEntityId", description, "updatedAt"
      )
      SELECT
        md5(${runId} || ':post:' || item::text)::uuid,
        ${ids.space}::uuid,
        ${ids.user}::uuid,
        md5(${runId} || ':entity:' || item::text)::uuid,
        CASE WHEN item % 900 = 0
          THEN 'A needle phrase appears in this report ' || item
          ELSE 'Routine report content ' || item
        END,
        now() - (item || ' seconds')::interval
      FROM generate_series(1, ${fixtureSize}) AS item
    `);
    await admin.$executeRawUnsafe('ANALYZE "ReportedEntity"');
    await admin.$executeRawUnsafe('ANALYZE "ReportedEntityHandle"');
    await admin.$executeRawUnsafe('ANALYZE "Post"');

    const scope = {
      accessibleSpaceIds: [ids.space],
      elevatedSpaceIds: [ids.space],
      isSuperAdmin: false,
    };
    const [postPlanRow] = await admin.$queryRaw<ExplainRow[]>(Prisma.sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      ${buildPostSearchQuery({ q: "needle" }, scope)}
    `);
    const [entityPlanRow] = await admin.$queryRaw<ExplainRow[]>(Prisma.sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      ${buildEntitySearchQuery({ q: "needle" }, scope)}
    `);

    const post = inspectPlan(
      "post search",
      parsePlan(postPlanRow),
      ["Post_description_fts_idx"],
      ["Post"],
    );
    const entity = inspectPlan(
      "entity search",
      parsePlan(entityPlanRow),
      [
        "ReportedEntityHandle_handle_fts_idx",
        "ReportedEntityHandle_handle_trgm_idx",
        "ReportedEntity_name_fts_idx",
        "ReportedEntity_name_trgm_idx",
      ],
      ["ReportedEntity", "ReportedEntityHandle"],
    );

    console.log(JSON.stringify({ fixtureSize, post, entity }));
  } finally {
    if (spaceCreated) await admin.space.deleteMany({ where: { id: ids.space } });
    if (userCreated) await admin.user.deleteMany({ where: { id: ids.user } });
    await admin.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Search query-plan verification failed");
  process.exitCode = 1;
});
