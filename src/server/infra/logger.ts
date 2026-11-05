import { pino } from "pino";

import { getConfig, type AppConfig } from "@/server/infra/config";

/**
 * RNF-13: logs JSON estruturados (pino) com correlationId e sem dados pessoais
 * (e-mails mascarados; nunca BI, NUIT, telefones ou notas).
 */

const redact = {
  paths: [
    "email",
    "*.email",
    "recipientEmail",
    "*.recipientEmail",
    "authorization",
    "*.authorization",
    "cookie",
    "*.cookie",
    "req.headers.authorization",
    "req.headers.cookie",
  ],
  censor: "[removido]",
};

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(cfg: AppConfig = getConfig(), correlationId?: string) {
  return pino(
    {
      level: cfg.logLevel,
      redact,
      base: correlationId ? { correlationId } : undefined,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
  );
}

/** Logger de processo (sem correlationId; os pedidos usam createLogger com id). */
export const logger: Logger = createLogger();