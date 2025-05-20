import { PrismaClient } from "~/generated/prisma";

let prisma: PrismaClient;

// Use a unique symbol or string on the global object for development
// to prevent multiple instances of Prisma Client in dev.
// 'globalThis' is the standard way to refer to the global object
// across different JavaScript environments.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
  // It's good practice to connect explicitly in production as well,
  // or ensure your first query does this.
  // prisma.$connect(); // Optional: connect on initialization
} else {
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      // Optional: Log SQL queries in development for debugging
      log: ["query", "info", "warn", "error"],
    });
  }
  prisma = globalThis.__prisma;
  // It's often useful to explicitly connect in development
  // to catch connection issues early.
  // However, Prisma does lazy connects, so this isn't strictly required
  // unless you want to ensure the connection is up immediately.
  // await prisma.$connect(); // You'd need to make this an async IIFE or handle the promise
}

export { prisma };
