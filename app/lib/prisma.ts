import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    console.warn(
      "[XMA] DATABASE_URL aponta para SQLite, mas o schema está em PostgreSQL. Defina uma URL postgres para produção.",
    );
  }
  globalForPrisma.prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
