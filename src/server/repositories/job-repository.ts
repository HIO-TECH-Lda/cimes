import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório da fila de tarefas do worker (G.10): a tabela `Job` com lock
 * por `lockedAt`/`lockedBy` evita execução dupla entre workers (RF-NOT-09).
 * Os claims são condicionais ao estado visto — só o primeiro `updateMany`
 * que encontra PENDING ganha, o segundo recebe count 0.
 */

export type JobRepository = ReturnType<typeof createJobRepository>;

export function createJobRepository(prisma: PrismaClient) {
  return {
    /** Tarefas vencidas: PENDING ou RUNNING com lock perdido (worker morto). */
    async findDue({ now, limit, staleAfter }: { now: Date; limit: number; staleAfter: Date }) {
      return prisma.job.findMany({
        where: {
          status: { in: ["PENDING", "RUNNING"] },
          runAt: { lte: now },
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleAfter } }],
        },
        orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
        take: limit,
      });
    },

    /** Tenta reclamar a tarefa no estado visto; true se este worker ganhou. */
    async claim({
      id,
      expectedStatus,
      lockedAt,
      lockedBy,
    }: {
      id: string;
      expectedStatus: string;
      lockedAt: Date;
      lockedBy: string;
    }) {
      const result = await prisma.job.updateMany({
        where: { id, status: expectedStatus },
        data: { status: "RUNNING", lockedAt, lockedBy },
      });
      return result.count === 1;
    },

    async complete({ id, finishedAt }: { id: string; finishedAt: Date }) {
      await prisma.job.update({
        where: { id },
        data: { status: "DONE", finishedAt, lastError: null },
      });
    },

    /**
     * Registra a falha: com tentativas restantes volta a PENDING com nova
     * hora de execução (backoff); sem elas fica FAILED para diagnóstico.
     */
    async fail({ id, lastError, runAt }: { id: string; lastError: string; runAt: Date | null }) {
      const job = await prisma.job.update({
        where: { id },
        data: { attempts: { increment: 1 }, lastError },
      });
      if (runAt !== null && job.attempts < job.maxAttempts) {
        await prisma.job.update({
          where: { id },
          data: { status: "PENDING", runAt, lockedAt: null, lockedBy: null },
        });
      } else {
        await prisma.job.update({
          where: { id },
          data: { status: "FAILED", lockedAt: null, lockedBy: null },
        });
      }
      return job;
    },

    /** Primeira tarefa com a chave única (para tarefas recorrentes). */
    async findByUniqueKey(uniqueKey: string) {
      return prisma.job.findFirst({ where: { uniqueKey } });
    },

    async create(data: {
      type: string;
      payloadJson?: string;
      runAt: Date;
      uniqueKey?: string | null;
    }) {
      return prisma.job.create({
        data: {
          type: data.type,
          payloadJson: data.payloadJson ?? "{}",
          runAt: data.runAt,
          uniqueKey: data.uniqueKey ?? null,
        },
      });
    },

    /** Rearma a tarefa recorrente terminada (uniqueKey é único na BD). */
    async rearm({ id, runAt, type }: { id: string; runAt: Date; type: string }) {
      return prisma.job.update({
        where: { id },
        data: {
          status: "PENDING",
          type,
          runAt,
          attempts: 0,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          finishedAt: null,
        },
      });
    },
  };
}