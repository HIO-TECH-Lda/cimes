import { createHash } from "node:crypto";

import type { DbClient, PrismaClient } from "@/server/repositories/db";

/**
 * Outbox de notificações (base de M14): em M1 as notificações N-01 (verificação
 * de e-mail), N-02 (recuperação de senha) e N-29 (aviso de segurança) são gravadas
 * na tabela `Notification`; o envio real (G.9) chega com M2 — com
 * `MAIL_TRANSPORT=memory` apenas ficam registadas, com `dev` ficam visíveis no
 * Mailpit pelo worker. Idempotência por chave estável (RF-NOT-01).
 */

export type EnqueueNotificationInput = {
  templateCode: string; // N-01 … N-30
  variant?: string;
  recipientUserId?: string | null;
  recipientEmail: string;
  payload: Record<string, unknown>;
  /** Chave de idempotência; se omitida, gera-se a partir do conteúdo. */
  idempotencyKey?: string;
};

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;

export function createNotificationRepository(prisma: DbClient) {
  const client = prisma as PrismaClient;
  return {
    async create(input: EnqueueNotificationInput) {
      const idempotencyKey =
        input.idempotencyKey ??
        createHash("sha256")
          .update(
            JSON.stringify({
              templateCode: input.templateCode,
              recipientEmail: input.recipientEmail.toLowerCase(),
              payload: input.payload,
            }),
          )
          .digest("hex")
          .slice(0, 200);
      return client.notification.create({
        data: {
          templateCode: input.templateCode,
          variant: input.variant,
          recipientUserId: input.recipientUserId,
          recipientEmail: input.recipientEmail.toLowerCase(),
          payloadJson: JSON.stringify(input.payload),
          idempotencyKey,
        },
      });
    },

    /** RF-AUT-05/07: contagem de envios recentes para limites por e-mail. */
    async countRecent(templateCode: string, recipientEmail: string, since: Date) {
      return client.notification.count({
        where: {
          templateCode,
          recipientEmail: recipientEmail.toLowerCase(),
          createdAt: { gte: since },
        },
      });
    },

    /** Linhas PENDING cuja hora de tentativa chegou (RF-NOT-03), ordenadas. */
    async findDue({ now, limit }: { now: Date; limit: number }) {
      return client.notification.findMany({
        where: { status: "PENDING", nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: limit,
      });
    },

    /** Marca SENT; a condição PENDING evita duplo envio por dois workers. */
    async markSent({ id, sentAt, providerMessageId }: { id: string; sentAt: Date; providerMessageId: string | null }) {
      return client.notification.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "SENT", sentAt, providerMessageId, lastError: null },
      });
    },

    /** Incrementa tentativas e agenda a próxima (só se continuar PENDING). */
    async scheduleRetry({ id, attempts, lastError, nextAttemptAt }: {
      id: string;
      attempts: number;
      lastError: string;
      nextAttemptAt: Date;
    }) {
      return client.notification.updateMany({
        where: { id, status: "PENDING" },
        data: { attempts, lastError, nextAttemptAt },
      });
    },

    /** Falha definitiva (RF-NOT-03: depois das retentativas). */
    async markFailed({ id, lastError, attempts }: { id: string; lastError: string; attempts?: number }) {
      return client.notification.updateMany({
        where: { id, status: "PENDING" },
        data: attempts === undefined ? { status: "FAILED", lastError } : { status: "FAILED", lastError, attempts },
      });
    },

    /** Aviso na aplicação criado junto com o e-mail (RF-NOT-04). */
    async createInApp({ userId, title, body, link }: {
      userId: string;
      title: string;
      body: string;
      link: string | null;
    }) {
      return client.inAppNotification.create({ data: { userId, title, body, link } });
    },
  };
}