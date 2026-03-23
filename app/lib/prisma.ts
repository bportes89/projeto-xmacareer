import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getSqliteFilePath(value: string) {
  if (value.startsWith("file:")) return value.slice("file:".length);
  return value;
}

function getSqliteUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não configurado");
  }
  return getSqliteFilePath(url);
}

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const adapter = new PrismaBetterSqlite3({ url: getSqliteUrl() });
  globalForPrisma.prisma = new PrismaClient({
    adapter,
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
