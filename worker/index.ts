import { getConfig } from "@/server/infra/config";
import { systemClock, type Clock } from "@/server/infra/clock";
import { createLogger } from "@/server/infra/logger";

/**
 * Worker (G.10): processo Node.js separado que executa as tarefas agendadas
 * reutilizando os serviços da aplicação. Em M0 não há tarefas agendadas
 * (chegam com M14, outbox de notificações); o worker valida a configuração
 * (RNF-05), cria o logger e fica vivo, registando um batimento periódico.
 */

const HEARTBEAT_MS = 60_000;

function main(clock: Clock = systemClock): void {
  // RNF-05: o worker não arranca se faltar uma variável obrigatória.
  const cfg = getConfig();
  const logger = createLogger(cfg);

  logger.info({ startedAt: clock.now().toISOString() }, "worker iniciado (sem tarefas agendadas em M0)");

  const heartbeat = setInterval(() => {
    logger.debug({ at: clock.now().toISOString() }, "worker vivo");
  }, HEARTBEAT_MS);

  const shutdown = (signal: string) => {
    clearInterval(heartbeat);
    logger.info({ signal }, "worker a terminar");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();