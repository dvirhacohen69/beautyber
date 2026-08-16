import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client Singleton
 * מונע יצירת חיבורי DB מרובים בסביבת פיתוח עם hot-reload (tsx watch).
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV === "development") {
  global.__prisma = prisma;
}
