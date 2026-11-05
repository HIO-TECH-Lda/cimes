/**
 * Transportes de e-mail (G.9, P-21): a outbox (RF-NOT-01 a 03) não conhece o
 * transporte — o worker escolhe conforme a configuração:
 * - `dev`: SMTP local (Mailpit :1025 no compose de desenvolvimento, R-01);
 * - `memory`: sem envio, só registo (testes e CI);
 * - `graph`/`smtp-oauth2`/`smtp-relay` (produção, P-21): chegam em M9/M10 —
 *   o worker recusa arrancar com eles enquanto não estiverem implementados.
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface MailTransport {
  send(message: MailMessage): Promise<{ messageId: string | null }>;
}

/** Instalação na primeira utilização, conforme o Anexo L (padrão do ADR-0002). */
export async function createMailTransport(kind: "dev" | "memory"): Promise<MailTransport> {
  if (kind === "memory") {
    return {
      async send() {
        // Sem envio real: usado em testes e CI (R-01, sem serviços externos).
        return { messageId: null };
      },
    };
  }
  // dev: SMTP do Mailpit do compose de desenvolvimento (:1025, sem autenticação).
  const { default: nodemailer } = await import("nodemailer");
  const client = nodemailer.createTransport({
    host: process.env.MAIL_DEV_SMTP_HOST ?? "localhost",
    port: Number(process.env.MAIL_DEV_SMTP_PORT ?? 1025),
    secure: false,
    tls: { rejectUnauthorized: false },
  });
  return {
    async send(message) {
      const result = await client.sendMail({
        from: process.env.MAIL_FROM ?? "CIMES <cimes@cimes.test>",
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { messageId: result.messageId ?? null };
    },
  };
}