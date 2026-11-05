import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Utilitário de desenvolvimento: desbloqueia as contas sintéticas
 * (@exemplo.mz) — limpa `lockedUntil` e apaga os LOGIN_FAILED recentes que
 * alimentam o bloqueio progressivo (RF-AUT-07). Nunca usar fora de dev.
 */
async function main(): Promise<void> {
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaMssql } = await import("@prisma/adapter-mssql");
  const { parseSqlserverUrl } = await import("../../src/server/infra/db-config");
  const prisma = new PrismaClient({ adapter: new PrismaMssql(parseSqlserverUrl(process.env.DATABASE_URL as string, 5)) });
  const accounts = await prisma.user.findMany({ where: { email: { endsWith: "@exemplo.mz" } }, select: { id: true } });
  const ids = accounts.map((a) => a.id);
  const unlocked = await prisma.user.updateMany({ where: { id: { in: ids } }, data: { lockedUntil: null } });
  const failures = await prisma.auditLog.deleteMany({
    where: { action: "LOGIN_FAILED", actorUserId: { in: ids }, occurredAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  console.log("desbloqueadas:", unlocked.count, "| LOGIN_FAILED apagados:", failures.count);
  await prisma.$disconnect();
}
void main();