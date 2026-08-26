import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Identity propagated from the HTTP authentication boundary to PostgreSQL.
 * Values are installed with SET LOCAL by the contextual Prisma client, so they
 * can never leak to another request when a pooled connection is reused.
 */
export type DbContext =
  | {
      mode: "user";
      userId: string;
      isSuperAdmin: boolean;
    }
  | {
      mode: "authentication";
      email: string;
    }
  | {
      mode: "registration";
      email: string;
      inviteTokens: readonly string[];
    };

const dbContextStorage = new AsyncLocalStorage<DbContext>();

export class MissingDbContextError extends Error {
  constructor() {
    super(
      "A Prisma query was attempted without an explicit SafeSpace database context"
    );
    this.name = "MissingDbContextError";
  }
}

export function getDbContext(): DbContext | undefined {
  return dbContextStorage.getStore();
}

export function runWithDbContext<T>(
  context: DbContext,
  operation: () => T
): T {
  return dbContextStorage.run(context, operation);
}

/**
 * Continue the current request with an authenticated identity. This is called
 * only after the user and its current super-admin flag have been re-read from
 * PostgreSQL.
 */
export function enterAuthenticatedDbContext(
  userId: string,
  isSuperAdmin: boolean
): void {
  dbContextStorage.enterWith({ mode: "user", userId, isSuperAdmin });
}
