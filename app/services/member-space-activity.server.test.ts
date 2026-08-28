import { describe, expect, it, vi } from "vitest";

import { runWithDbContext } from "../db/context.server";

vi.mock("~/db/client.server", () => ({ prisma: {} }));

import {
  MemberSpaceActivityContextError,
  recordMemberSpaceActivity,
} from "./member-space-activity.server";

const USER_ID = "76e4d451-7120-49a9-9e3e-0ad7b1981ac1";
const SPACE_ID = "113e4567-e89b-12d3-a456-426614174000";

function client(options: {
  membership?: { userId: string } | null;
  role?: string;
  discipline?: "restriction" | "suspension" | null;
  superAdmin?: boolean;
  writeCount?: number;
} = {}) {
  const membership = options.membership === null ? null : { role: options.role ?? "EDITOR", userId: USER_ID };
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ isSuperAdmin: options.superAdmin ?? false }),
    },
    userSpaceMembership: {
      findUnique: vi.fn().mockImplementation((args: { select: { userId?: boolean } }) =>
        Promise.resolve(
          membership === null
            ? null
            : args.select.userId
              ? { userId: membership.userId }
              : { role: membership.role }
        )
      ),
    },
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(
        options.discipline ? { id: "discipline", kind: options.discipline } : null
      ),
    },
    $executeRaw: vi.fn().mockResolvedValue(options.writeCount ?? 1),
  };
  return {
    tx,
    client: {
      $transaction: vi.fn((operation: (transaction: typeof tx) => unknown) => operation(tx)),
    },
  };
}

function asAuthenticated<T>(operation: () => T): T {
  return runWithDbContext(
    { mode: "user", userId: USER_ID, isSuperAdmin: false },
    operation
  );
}

describe("recordMemberSpaceActivity", () => {
  it("requires the database context to be the supplied actor", async () => {
    const fixture = client();

    await expect(
      recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
    ).rejects.toBeInstanceOf(MemberSpaceActivityContextError);
    expect(fixture.client.$transaction).not.toHaveBeenCalled();

    await expect(
      runWithDbContext(
        { mode: "user", userId: "another-user", isSuperAdmin: false },
        () => recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).rejects.toBeInstanceOf(MemberSpaceActivityContextError);
  });

  it("does nothing once access or the membership is gone", async () => {
    const fixture = client({
      membership: null,
    });

    await expect(
      asAuthenticated(() =>
        recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).resolves.toEqual({ recorded: false });
    expect(fixture.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("records a read-only restricted member with one database-clocked write", async () => {
    const fixture = client({
      role: "ADMIN",
      discipline: "restriction",
    });

    await expect(
      asAuthenticated(() =>
        recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).resolves.toEqual({ recorded: true });

    expect(fixture.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reports no-op when PostgreSQL finds the stored UTC day current", async () => {
    const fixture = client({ writeCount: 0 });

    await expect(
      asAuthenticated(() =>
        recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).resolves.toEqual({ recorded: false });
    expect(fixture.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reports an activity record when PostgreSQL changes the stored UTC day", async () => {
    const fixture = client({ writeCount: 1 });

    await expect(
      asAuthenticated(() =>
        recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).resolves.toEqual({ recorded: true });
    expect(fixture.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does not let a suspended super-admin write a membership aggregate", async () => {
    const fixture = client({
      superAdmin: true,
      discipline: "suspension",
    });

    await expect(
      asAuthenticated(() =>
        recordMemberSpaceActivity(USER_ID, SPACE_ID, fixture.client as never)
      )
    ).resolves.toEqual({ recorded: false });
    expect(fixture.tx.$executeRaw).not.toHaveBeenCalled();
  });
});
