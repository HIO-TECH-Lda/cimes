import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

import { getConfig } from "@/server/infra/config";
import { parseSqlserverUrl } from "@/server/infra/db-config";

/**
 * R-02: este é (com prisma/seed/**) o único sítio que importa o cliente Prisma.
 * Todas as consultas de negócio passam por src/server/repositories/** com o âmbito
 * do Principal. O cliente usa o driver adapter `PrismaMssql` confirmado em ADR-0001
 * e o tamanho do pool é definido explicitamente (G.4).
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Tipo do cliente Prisma re-exportado (serviços importam daqui, R-02). */
export type { PrismaClient, Prisma };

/** Cliente de base de dados: o PrismaClient ou a transaccao em curso. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export function getPrismaClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

export function createPrismaClient(): PrismaClient {
  const cfg = getConfig();
  const adapter = new PrismaMssql(parseSqlserverUrl(cfg.databaseUrl, cfg.databasePoolMax));
  return new PrismaClient({ adapter });
}

/** Verificação simples de ligação (usada por /api/health/ready). */
export async function pingDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}