import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaPool?: Pool };

function getDatabaseUrl() {
  return (
    process.env.POSTGRES_PRISMA_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.PGDATABASE_URL ??
    ""
  );
}

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL/POSTGRES_PRISMA_URL não definida");
  }
  if (url.startsWith("file:")) {
    console.warn(
      "[XMA] DATABASE_URL aponta para SQLite, mas o schema está em PostgreSQL. Defina uma URL postgres para produção.",
    );
  }

  const pool = globalForPrisma.prismaPool ?? new Pool({ connectionString: url });
  globalForPrisma.prismaPool = pool;

  globalForPrisma.prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
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
