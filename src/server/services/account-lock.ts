import type { AuditLogRepository, AuditLogFilters } from "@/server/repositories/audit-log-repository";
import type { UserRepository } from "@/server/repositories/user-repository";
import type { NotificationRepository } from "@/server/repositories/notification-repository";
import { systemClock, type Clock } from "@/server/infra/clock";
import type { Logger } from "@/server/infra/logger";

/**
 * Bloqueio progressivo de conta (RF-AUT-07):
 * - 5 tentativas falhadas em 15 minutos por conta ou IP → captcha obrigatório;
 * - 10 tentativas em 15 minutos por conta → bloqueio de 30 minutos, registado
 *   em auditoria (ACCOUNT_LOCKED) e com aviso N-29 ao utilizador.
 * A contagem usa o próprio AuditLog (só de acréscimo, RF-AUD-01): a janela
 * deslizante desconta naturalmente as tentativas antigas.
 */

export const CAPTCHA_THRESHOLD = 5;
export const LOCK_THRESHOLD = 10;
export const WINDOW_MINUTES = 15;
export const LOCK_MINUTES = 30;

export type FailedLoginInput = {
  userId: string | null;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId?: string | null;
};

export type AccountLockService = ReturnType<typeof createAccountLockService>;

export function createAccountLockService(
  deps: {
    auditLogRepository: AuditLogRepository;
    userRepository: UserRepository;
    notificationRepository: NotificationRepository;
  },
  clock: Clock = systemClock,
  logger?: Logger,
) {
  const countRecentFailures = async (filters: AuditLogFilters): Promise<number> => {
    const result = await deps.auditLogRepository.list({
      ...filters,
      actions: ["LOGIN_FAILED"],
      from: new Date(clock.now().getTime() - WINDOW_MINUTES * 60 * 1000),
      pageSize: 1, // só interessa o total
    });
    return result.total;
  };

  return {
    /** Regista a falha de entrada e aplica os limiares progressivos. */
    async registerFailedLogin(input: FailedLoginInput) {
      const now = clock.now();
      await deps.auditLogRepository.create({
        actorUserId: input.userId,
        actorRoles: [],
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: input.userId ?? undefined,
        summary: input.email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        correlationId: input.correlationId ?? null,
      });

      const byAccount = input.userId
        ? await countRecentFailures({ actorUserId: input.userId })
        : 0;
      const byIp = input.ipAddress
        ? await countRecentFailures({ ipAddress: input.ipAddress })
        : 0;

      const captchaRequired = byAccount >= CAPTCHA_THRESHOLD || byIp >= CAPTCHA_THRESHOLD;
      let lockedUntil: Date | null = null;

      if (input.userId && byAccount >= LOCK_THRESHOLD) {
        lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
        await deps.userRepository.setLockedUntil(input.userId, lockedUntil);
        await deps.auditLogRepository.create({
          actorUserId: input.userId,
          actorRoles: [],
          action: "ACCOUNT_LOCKED",
          entityType: "User",
          entityId: input.userId,
          summary: `bloqueio de ${LOCK_MINUTES} minutos após ${byAccount} falhas em ${WINDOW_MINUTES} minutos`,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          correlationId: input.correlationId ?? null,
        });
        await deps.notificationRepository.create({
          templateCode: "N-29",
          recipientUserId: input.userId,
          recipientEmail: input.email,
          payload: {
            motivo: "BLOQUEIO_TENTATIVAS",
            ate: lockedUntil.toISOString(),
          },
          // Um único aviso por bloqueio.
          idempotencyKey: `N-29:${input.userId}:${lockedUntil.toISOString()}`,
        });
        logger?.warn({ userId: input.userId, byAccount }, "conta bloqueada por tentativas");
      }

      return { captchaRequired, lockedUntil, byAccount, byIp };
    },

    /** Indica se a conta está bloqueada no instante actual. */
    async isLocked(userId: string): Promise<Date | null> {
      const user = await deps.userRepository.findById(userId);
      if (!user?.lockedUntil) return null;
      return user.lockedUntil > clock.now() ? user.lockedUntil : null;
    },

    /** Verifica o estado e lança informação para a UI antes da autenticação. */
    async loginState(userId: string): Promise<{ captchaRequired: boolean; lockedUntil: Date | null }> {
      const lockedUntil = await this.isLocked(userId);
      const byAccount = await countRecentFailures({ actorUserId: userId });
      return { captchaRequired: byAccount >= CAPTCHA_THRESHOLD, lockedUntil };
    },
  };
}