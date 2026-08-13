import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// tsx watch reloads this module on every save. Without the global cache each
// reload would open a fresh pool and eventually exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ["error"] : ["warn", "error"],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;
