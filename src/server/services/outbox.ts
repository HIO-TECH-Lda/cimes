import type { Clock } from "@/server/infra/clock";
import type { MailTransport } from "@/server/notifications/transport";
import { inAppContent, renderNotification } from "@/server/notifications/templates";
import type { NotificationRepository } from "@/server/repositories/notification-repository";
import type { Logger } from "@/server/infra/logger";

/**
 * Processador da outbox (base de M14, RF-NOT-01 a 04): envia as notificações
 * PENDING cuja hora de tentativa chegou, com retentativas 1 min, 5 min,
 * 30 min, 2 h e 12 h (RF-NOT-03); após a última, marca FAILED e enfileira
 * N-30 ao administrador de sistema. Cria o aviso na aplicação junto com o
 * envio (RF-NOT-04). Cada marcação condiciona a estado PENDING, por isso
 * dois workers nunca enviam a mesma notificação duas vezes.
 */

/** Retentativas em minutos após cada falha (RF-NOT-03). */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 720] as const;

export type OutboxProcessor = ReturnType<typeof createOutboxProcessor>;

export function createOutboxProcessor(deps: {
  notifications: NotificationRepository;
  transport: MailTransport;
  clock: Clock;
  logger?: Logger;
}) {
  const { notifications, transport, clock, logger } = deps;

  async function failPermanently(row: {
    id: string;
    templateCode: string;
    lastError: string;
    attempts?: number;
  }, sysadminEmail: string) {
    await notifications.markFailed({ id: row.id, lastError: row.lastError, attempts: row.attempts });
    // N-30 (Anexo E) ao administrador de sistema; idempotente por linha
    // falhada. Um N-30 que falha não gera outro N-30 em cascata.
    if (row.templateCode !== "N-30") {
      await notifications.create({
        templateCode: "N-30",
        recipientEmail: sysadminEmail,
        payload: { contexto: `${row.templateCode} (${row.id})` },
        idempotencyKey: `N-30:outbox:${row.id}`,
      });
    }
  }

  return {
    /** Processa um lote; devolve contagens para o registo do worker. */
    async processDue({ sysadminEmail, limit = 20 }: { sysadminEmail: string; limit?: number }) {
      const now = clock.now();
      const due = await notifications.findDue({ now, limit });
      let sent = 0;
      let retried = 0;
      let failed = 0;

      for (const row of due) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
        } catch {
          await failPermanently(
            { id: row.id, templateCode: row.templateCode, lastError: "payloadJson inválido" },
            sysadminEmail,
          );
          failed += 1;
          continue;
        }

        let rendered = null as Awaited<ReturnType<typeof renderNotification>>;
        try {
          rendered = await renderNotification(row.templateCode, row.variant, payload);
        } catch (error) {
          await failPermanently(
            { id: row.id, templateCode: row.templateCode, lastError: `modelo: ${String(error)}` },
            sysadminEmail,
          );
          failed += 1;
          continue;
        }
        if (!rendered) {
          // Catálogo fechado (RF-NOT-07): código sem modelo é um erro de código,
          // não retentável.
          await failPermanently(
            { id: row.id, templateCode: row.templateCode, lastError: "sem modelo no catálogo" },
            sysadminEmail,
          );
          failed += 1;
          continue;
        }

        try {
          const result = await transport.send({
            to: row.recipientEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
          const marked = await notifications.markSent({
            id: row.id,
            sentAt: clock.now(),
            providerMessageId: result.messageId,
          });
          if (marked.count === 1) {
            sent += 1;
            if (row.recipientUserId) {
              const inApp = inAppContent(row.templateCode, payload);
              if (inApp) {
                await notifications.createInApp({
                  userId: row.recipientUserId,
                  title: inApp.title,
                  body: inApp.body,
                  link: inApp.link,
                });
              }
            }
          }
        } catch (error) {
          const attempts = row.attempts + 1;
          const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
          // N-30 não gera N-30 em cascata (Anexo E: falha técnica do sistema).
          if (row.templateCode === "N-30" || attempts > RETRY_DELAYS_MINUTES.length) {
            await failPermanently(
              { id: row.id, templateCode: row.templateCode, lastError: message, attempts },
              sysadminEmail,
            );
            failed += 1;
          } else {
            const delay = RETRY_DELAYS_MINUTES[attempts - 1]!;
            const marked = await notifications.scheduleRetry({
              id: row.id,
              attempts,
              lastError: message,
              nextAttemptAt: new Date(clock.now().getTime() + delay * 60_000),
            });
            if (marked.count === 1) retried += 1;
          }
          logger?.warn(
            { notificationId: row.id, templateCode: row.templateCode, attempts, err: message },
            "envio de notificação falhou",
          );
        }
      }

      return { sent, retried, failed };
    },
  };
}