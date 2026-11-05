import type { Clock } from "@/server/infra/clock";
import type { Logger } from "@/server/infra/logger";
import type { JobRepository } from "@/server/repositories/job-repository";

/**
 * Corredor de tarefas do worker (G.10, RF-NOT-09): reivindica tarefas
 * PENDING vencidas, executa o handler registado, marca DONE ou reagenda com
 * backoff (1 min, 5 min, 15 min) até `maxAttempts`. Locks antigos (worker
 * morto) são retomáveis. O relógio é injectável para testes.
 */

const BACKOFF_MINUTES = [1, 5, 15] as const;
/** Lock com mais de 10 minutos pertence a um worker morto. */
const DEFAULT_STALE_MS = 10 * 60_000;

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export type JobRunner = ReturnType<typeof createJobRunner>;

export function createJobRunner(deps: {
  jobs: JobRepository;
  clock: Clock;
  workerId: string;
  handlers: Record<string, JobHandler>;
  logger?: Logger;
}) {
  const { jobs, clock, workerId, handlers, logger } = deps;

  return {
    /**
     * Executa as tarefas vencidas. `staleAfterMs` permite encurtar o prazo
     * de retoma de locks em testes.
     */
    async runDue({ limit = 10, staleAfterMs = DEFAULT_STALE_MS }: { limit?: number; staleAfterMs?: number } = {}) {
      const now = clock.now();
      const due = await jobs.findDue({
        now,
        limit,
        staleAfter: new Date(now.getTime() - staleAfterMs),
      });
      let done = 0;
      let failed = 0;

      for (const job of due) {
        const claimed = await jobs.claim({
          id: job.id,
          expectedStatus: job.status,
          lockedAt: now,
          lockedBy: workerId,
        });
        if (!claimed) continue; // outro worker chegou primeiro
        const handler = handlers[job.type];
        if (!handler) {
          await jobs.fail({ id: job.id, lastError: `sem handler para ${job.type}`, runAt: null });
          failed += 1;
          continue;
        }
        try {
          const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;
          await handler(payload);
          await jobs.complete({ id: job.id, finishedAt: clock.now() });
          done += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
          const attempt = job.attempts + 1;
          const backoffMin = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length) - 1]!;
          await jobs.fail({
            id: job.id,
            lastError: message,
            runAt: new Date(clock.now().getTime() + backoffMin * 60_000),
          });
          failed += 1;
          logger?.warn({ jobId: job.id, type: job.type, attempt, err: message }, "tarefa falhou");
        }
      }

      return { done, failed };
    },

    /**
     * Garante a próxima ocorrência de uma tarefa recorrente (RF-NOT-09):
     * `uniqueKey` é único na BD, por isso a mesma linha é rearmada — se não
     * houver tarefa cria-a; se a anterior terminou (DONE/FAILED) volta a
     * PENDING com a hora seguinte (`everyMs` após o fim) e contadores a zero.
     */
    async ensureRecurring({ type, uniqueKey, everyMs }: { type: string; uniqueKey: string; everyMs: number }) {
      const existing = await jobs.findByUniqueKey(uniqueKey);
      if (existing && (existing.status === "PENDING" || existing.status === "RUNNING")) {
        return false;
      }
      const runAt = existing?.finishedAt
        ? new Date(Math.max(existing.finishedAt.getTime() + everyMs, clock.now().getTime()))
        : clock.now();
      if (existing) {
        await jobs.rearm({ id: existing.id, runAt, type });
        return true;
      }
      await jobs.create({ type, runAt, uniqueKey });
      return true;
    },
  };
}