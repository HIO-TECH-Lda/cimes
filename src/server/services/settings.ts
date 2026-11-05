import { validateSetting, type SettingCode } from "@/server/domain/settings";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import { createSettingRepository, type SettingRepository } from "@/server/repositories/setting-repository";
import type { AuditService } from "@/server/services/audit";
import { buildAuditDiff } from "@/server/services/audit-diff";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * Parâmetros do sistema (RF-ADM-11): leitura para qualquer utilizador
 * autenticado; alteração só para quem tem `settings.manage` (HR_MANAGER, C.3),
 * com validação Zod do contrato e auditoria antigo/novo (SETTING_CHANGED).
 */
export type SettingService = ReturnType<typeof createSettingService>;

export function createSettingService(
  deps: { prisma: PrismaClient; audit: AuditService },
) {
  const repository: SettingRepository = createSettingRepository(deps.prisma);

  return {
    /** Todos os parâmetros (back-office, RF-ADM-11). */
    async list(principal: Principal) {
      assertCan(principal, "settings.manage");
      return repository.list();
    },

    /** Valor validado de um parâmetro (com omissão do domínio se não estiver em BD). */
    async get(code: SettingCode): Promise<string | null> {
      const row = await repository.findByCode(code);
      return row?.valueJson ?? null;
    },

    /** Altera um parâmetro; valida contra o contrato e audita antigo→novo. */
    async update(principal: Principal, code: string, valueJson: string) {
      assertCan(principal, "settings.manage");

      const validation = validateSetting(code, valueJson);
      if (!validation.ok) {
        throw new ForbiddenError(`Parâmetro inválido: ${validation.error}`);
      }

      const existing = await repository.findByCode(code);
      const previous = existing?.valueJson ?? null;
      if (previous === valueJson) return existing ?? { code, valueJson };

      const row = await repository.upsert({
        code,
        valueJson,
        updatedById: principal.userId,
      });

      await deps.audit.record({
        actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
        action: "SETTING_CHANGED",
        entityType: "Setting",
        entityId: code,
        summary: `parâmetro ${code} alterado`,
        diff: buildAuditDiff(previous ? { valor: previous } : null, { valor: valueJson }),
      });
      return row;
    },

    /** Lê um parâmetro obrigatório; falta em BD e sem omissão é 404. */
    async getOrThrow(code: SettingCode): Promise<string> {
      const value = await this.get(code);
      if (value == null) throw new NotFoundError(`Parâmetro em falta: ${code}`);
      return value;
    },
  };
}