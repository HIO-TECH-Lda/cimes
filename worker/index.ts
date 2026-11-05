import { getConfig } from "@/server/infra/config";
import { systemClock, type Clock } from "@/server/infra/clock";
import { createLogger } from "@/server/infra/logger";
import { createMailTransport } from "@/server/notifications/transport";
import { createJobRepository } from "@/server/repositories/job-repository";
import { createNotificationRepository } from "@/server/repositories/notification-repository";
import { createRoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import { getPrismaClient } from "@/server/repositories/db";
import { createAuditService } from "@/server/services/audit";
import { createJobRunner } from "@/server/services/jobs";
import { createOpeningService } from "@/server/services/openings";
import { createOutboxProcessor } from "@/server/services/outbox";
import { createSettingService } from "@/server/services/settings";

/**
 * Worker (G.10, base de M14): processo Node.js separado que executa as tarefas
 * agendadas e processa a outbox de notificações (RF-NOT-01 a 05, RF-NOT-09).
 * O loop corre a cada 15 s (`notifications.send`); as tarefas recorrentes
 * vivem na tabela `Job` com lock contra execução dupla. Relógio injectável
 * para testes (não usado aqui — o worker real usa o relógio do sistema).
 */

const TICK_MS = 15_000;
const OUTBOX_BATCH = 20;
const JOB_BATCH = 10;

async function resolveSysadminEmail(now: Date): Promise<string> {
  const cfg = getConfig();
  if (cfg.hrNotificationsEmail) return cfg.hrNotificationsEmail;
  const roles = createRoleAssignmentRepository(getPrismaClient());
  const email = await roles.findSystemAdminEmail(now);
  if (!email) throw new Error("HR_NOTIFICATIONS_EMAIL não definida e sem SYSTEM_ADMIN activo (destino do N-30)");
  return email;
}

async function main(clock: Clock = systemClock): Promise<void> {
  // RNF-05: o worker não arranca se faltar uma variável obrigatória.
  const cfg = getConfig();
  const logger = createLogger(cfg);

  const transportKind = cfg.mailTransport;
  if (transportKind !== "dev" && transportKind !== "memory") {
    // P-21: os transportes de produção (Graph/SMTP) chegam em M9/M10.
    throw new Error(`MAIL_TRANSPORT=${transportKind} ainda não implementado no worker (M9/M10)`);
  }
  const transport = await createMailTransport(transportKind);

  const prisma = getPrismaClient();
  const notifications = createNotificationRepository(prisma);
  const jobs = createJobRepository(prisma);
  const outbox = createOutboxProcessor({ notifications, transport, clock, logger });
  // RF-VAG-03: a tarefa `openings.closeExpired` corre a cada 5 minutos e fecha
  // as vagas publicadas cuja janela de candidatura venceu (actor SYSTEM).
  const openings = createOpeningService({
    prisma,
    audit: createAuditService(prisma, logger),
    settings: createSettingService({ prisma, audit: createAuditService(prisma, logger) }),
    clock,
    logger,
  });
  const jobRunner = createJobRunner({
    jobs,
    clock,
    workerId: `worker-${process.pid}`,
    handlers: {
      "openings.closeExpired": async () => {
        const fechadas = await openings.closeExpired();
        if (fechadas.length > 0) logger.info({ fechadas }, "vagas fechadas automaticamente (prazo vencido)");
      },
    },
    logger,
  });

  const CLOSE_EXPIRED_EVERY_MS = 5 * 60_000; // RF-VAG-03: a cada 5 minutos
  await jobRunner.ensureRecurring({ type: "openings.closeExpired", uniqueKey: "openings.closeExpired", everyMs: CLOSE_EXPIRED_EVERY_MS });

  logger.info({ startedAt: clock.now().toISOString(), transport: transportKind }, "worker iniciado");

  let sysadminEmail: string | null = null;
  let parado = false;
  const tick = async () => {
    try {
      sysadminEmail ??= await resolveSysadminEmail(clock.now());
      const outboxResult = await outbox.processDue({ sysadminEmail, limit: OUTBOX_BATCH });
      const jobResult = await jobRunner.runDue({ limit: JOB_BATCH });
      if (outboxResult.sent + outboxResult.retried + outboxResult.failed + jobResult.done + jobResult.failed > 0) {
        logger.info({ ...outboxResult, ...jobResult }, "ciclo do worker");
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, "ciclo do worker falhou");
    }
  };

  const timer = setInterval(() => {
    if (parado) return;
    void tick();
  }, TICK_MS);
  void tick(); // primeiro ciclo imediato

  const shutdown = (signal: string) => {
    parado = true;
    clearInterval(timer);
    logger.info({ signal }, "worker a terminar");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();