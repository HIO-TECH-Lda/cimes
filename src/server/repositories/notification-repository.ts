import { createHash } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";

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

export function createNotificationRepository(prisma: PrismaClient) {
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
      return prisma.notification.create({
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
      return prisma.notification.count({
        where: {
          templateCode,
          recipientEmail: recipientEmail.toLowerCase(),
          createdAt: { gte: since },
        },
      });
    },
  };
}