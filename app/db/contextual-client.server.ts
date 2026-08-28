import type { PrismaClient } from "~/generated/prisma";

import {
  getDbContext,
  MissingDbContextError,
  type DbContext,
} from "./context.server";

const MODEL_DELEGATES = new Set([
  "user",
  "space",
  "userSpaceMembership",
  "invite",
  "reportedEntity",
  "reportedEntityHandle",
  "post",
  "media",
  "mediaDeletionJob",
  "postFlag",
  "moderationAppeal",
  "disciplinaryAction",
  "sensitiveReviewRound",
  "sensitiveReviewDecision",
  "auditLog",
  "savedSearch",
  "systemAnnouncement",
]);
const RAW_OPERATIONS = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
  "$queryRaw",
  "$queryRawUnsafe",
]);

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

const CONTEXT_SQL = `
  SELECT
    set_config('safespace.user_id', $1, true),
    set_config('safespace.is_superadmin', $2, true),
    set_config('safespace.context_mode', $3, true),
    set_config('safespace.login_email', $4, true),
    set_config('safespace.invite_tokens', $5, true)
`;

function contextParameters(context: DbContext): [string, string, string, string, string] {
  if (context.mode === "user") {
    return [
      context.userId,
      context.isSuperAdmin ? "on" : "off",
      context.mode,
      "",
      "",
    ];
  }

  if (context.mode === "authentication") {
    return ["", "off", context.mode, context.email, ""];
  }

  return [
    "",
    "off",
    context.mode,
    context.email,
    context.inviteTokens.join(","),
  ];
}

async function installContext(
  transaction: TransactionClient,
  context: DbContext
): Promise<void> {
  await transaction.$queryRawUnsafe(CONTEXT_SQL, ...contextParameters(context));
}

function requireContext(): DbContext {
  const context = getDbContext();
  if (!context) throw new MissingDbContextError();
  return context;
}

/**
 * Wrap Prisma without relying on connection-level SET. Every standalone model
 * operation gets a short interactive transaction; existing interactive
 * transactions get the same context installed once before their callback.
 *
 * Array-form `$transaction([promise, ...])` is deliberately rejected because
 * the model promises would already have run in their own contextual
 * transactions. SafeSpace uses callback transactions exclusively.
 */
export function createContextualPrismaClient(base: PrismaClient): PrismaClient {
  const delegateCache = new Map<string, object>();

  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (
          operation: unknown,
          options?: Parameters<PrismaClient["$transaction"]>[1]
        ) => {
          if (typeof operation !== "function") {
            throw new TypeError(
              "Contextual Prisma only supports callback-form $transaction"
            );
          }

          const context = requireContext();
          return target.$transaction(async (transaction) => {
            await installContext(transaction, context);
            return operation(transaction);
          }, options);
        };
      }

      if (typeof property === "string" && RAW_OPERATIONS.has(property)) {
        return async (...args: unknown[]) => {
          const context = requireContext();
          return target.$transaction(async (transaction) => {
            await installContext(transaction, context);
            const operation = Reflect.get(transaction, property) as (
              ...operationArgs: unknown[]
            ) => unknown;
            return Reflect.apply(operation, transaction, args);
          });
        };
      }

      if (typeof property === "string" && MODEL_DELEGATES.has(property)) {
        const cached = delegateCache.get(property);
        if (cached) return cached;

        const delegate = Reflect.get(target, property, receiver) as object;
        const contextualDelegate = new Proxy(delegate, {
          get(delegateTarget, operation, delegateReceiver) {
            const value = Reflect.get(
              delegateTarget,
              operation,
              delegateReceiver
            ) as unknown;
            if (typeof value !== "function") return value;

            return async (...args: unknown[]) => {
              const context = requireContext();
              return target.$transaction(async (transaction) => {
                await installContext(transaction, context);
                const transactionDelegate = Reflect.get(
                  transaction,
                  property
                ) as object;
                const transactionOperation = Reflect.get(
                  transactionDelegate,
                  operation
                ) as (...operationArgs: unknown[]) => unknown;
                return Reflect.apply(
                  transactionOperation,
                  transactionDelegate,
                  args
                );
              });
            };
          },
        });
        delegateCache.set(property, contextualDelegate);
        return contextualDelegate;
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const dbContextSql = CONTEXT_SQL;
