import { PrismaClient } from "~/generated/prisma";
import { createContextualPrismaClient } from "./contextual-client.server";

let basePrisma: PrismaClient;

// Use a unique symbol or string on the global object for development
// to prevent multiple instances of Prisma Client in dev.
// 'globalThis' is the standard way to refer to the global object
// across different JavaScript environments.
declare global {
  // eslint-disable-next-line no-var
  var __basePrisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  basePrisma = new PrismaClient({ log: [] });
  // It's good practice to connect explicitly in production as well,
  // or ensure your first query does this.
  // prisma.$connect(); // Optional: connect on initialization
} else {
  if (!globalThis.__basePrisma) {
    globalThis.__basePrisma = new PrismaClient({
      // Prisma's raw diagnostics can include invocation data or connection
      // details. Keep the same privacy boundary in development and production;
      // action/SSR boundaries report only sanitized technical telemetry.
      log: [],
    });
  }
  basePrisma = globalThis.__basePrisma;
  // It's often useful to explicitly connect in development
  // to catch connection issues early.
  // However, Prisma does lazy connects, so this isn't strictly required
  // unless you want to ensure the connection is up immediately.
  // await prisma.$connect(); // You'd need to make this an async IIFE or handle the promise
}

const prisma = createContextualPrismaClient(basePrisma);

export { prisma };
