import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";

import { getConfig } from "@/server/infra/config";
import { getPrismaClient } from "@/server/repositories/db";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createNotificationRepository } from "@/server/repositories/notification-repository";

/**
 * Autenticação (M01, Better Auth 1.7 — APIs confirmadas na versão fixada, R-20):
 * - adapter Prisma com `provider: "sqlserver"` (Anexo L do stack, linha 160);
 * - Microsoft Entra ID com `tenantId` fixo do inquilino da Cornelder (nunca
 *   "common", RF-AUT-01/P-20); o identificador externo é o claim `oid`;
 * - e-mail + senha para candidatos (RF-AUT-03/04) e colaboradores em modo local
 *   (contingência/desenvolvimento, RF-AUT-02);
 * - sessões (RF-AUT-06): 7 dias renováveis para externos; staff 8 h absolutas
 *   (hook `session.create.before`) com inactividade de 30 min (session.ts);
 * - verificação de e-mail e recuperação de senha passam pelo outbox `Notification`
 *   (N-01, N-02), com envio real a partir de M2 (G.9);
 * - limites de pedidos por IP (RF-AUT-07) via rateLimit do Better Auth.
 */

export function createAuth() {
  const cfg = getConfig();
  const prisma = getPrismaClient();
  const users = createUserRepository(prisma);
  const notifications = createNotificationRepository(prisma);

  const entraEnabled =
    cfg.staffAuthMode === "entra" &&
    Boolean(cfg.microsoftClientId) &&
    Boolean(cfg.microsoftClientSecret) &&
    Boolean(cfg.microsoftTenantId);

  return betterAuth({
    secret: cfg.betterAuthSecret,
    baseURL: cfg.publicBaseUrl,
    trustedOrigins: [cfg.publicBaseUrl],

    database: prismaAdapter(prisma, { provider: "sqlserver" }),
    advanced: { database: { joins: true } },

    user: {
      additionalFields: {
        userType: {
          type: "string",
          fieldName: "userType",
          input: true,
          defaultValue: "EXTERNAL",
        },
        status: {
          type: "string",
          fieldName: "status",
          input: false,
          defaultValue: "ACTIVE",
        },
        // Campos do Anexo A que a aplicação mantém; o Better Auth só os lê.
        lockedUntil: { type: "date", fieldName: "lockedUntil", input: false },
        lastSeenAt: { type: "date", fieldName: "lastSeenAt", input: false },
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10, // RF-AUT-04 (a lista de comuns e o e-mail são validados no serviço de registo)
      resetPasswordTokenExpiresIn: 60 * 60, // RF-AUT-05: 60 minutos
      sendResetPassword: async ({ user, url }) => {
        await notifications.create({
          templateCode: "N-02",
          recipientUserId: user.id,
          recipientEmail: user.email,
          payload: { url },
          // Um só e-mail de recuperação por pedido de reposição (token único).
          idempotencyKey: `N-02:${user.id}:${url.split("token=")[1]?.split(".")[0] ?? ""}`,
        });
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await notifications.create({
          templateCode: "N-01",
          recipientUserId: user.id,
          recipientEmail: user.email,
          payload: { url },
          // Token de verificação é único; a chave evita envios duplicados do mesmo link.
          idempotencyKey: `N-01:${user.id}:${url.split("token=")[1]?.split(".")[0] ?? ""}`,
        });
      },
      autoSignInAfterVerification: true,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // RF-AUT-06: externos, 7 dias renovados com o uso
      updateAge: 60 * 60 * 24, // renovação diária com actividade
      freshAge: 0,
    },

    socialProviders: entraEnabled
      ? {
          microsoft: {
            clientId: cfg.microsoftClientId as string,
            clientSecret: cfg.microsoftClientSecret as string,
            tenantId: cfg.microsoftTenantId as string, // inquilino fixo, nunca "common"
            // Colaboradores: userType STAFF no primeiro acesso (RF-AUT-01).
            mapProfileToUser: () => ({ userType: "STAFF" }),
          },
        }
      : {},

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["microsoft"],
      },
    },

    plugins: [twoFactor()],

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        // RF-AUT-07: registo limitado a 5 por hora por IP.
        "/sign-up/email": { window: 60 * 60, max: 5 },
        // RF-AUT-07: recuperação limitada a 3 por hora por IP.
        "/forget-password": { window: 60 * 60, max: 3 },
        // RF-AUT-07: entrada com 10 tentativas por 15 minutos por IP; o
        // bloqueio por conta (5/15 min captcha, 10/15 min lock) é o account-lock.ts.
        "/sign-in/email": { window: 15 * 60, max: 10 },
      },
    },

    databaseHooks: {
      session: {
        create: {
          // RF-AUT-06: staff tem expiração absoluta de 8 horas.
          before: async (session) => {
            const userType = await users.getType(session.userId as string);
            if (userType === "STAFF") {
              return {
                data: {
                  ...session,
                  expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
                },
              };
            }
            return;
          },
        },
      },
    },
  });
}

/** Instância única por processo (a config é validada uma vez, RNF-05). */
type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { cimesAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.cimesAuth ??= createAuth();
  return globalForAuth.cimesAuth;
}