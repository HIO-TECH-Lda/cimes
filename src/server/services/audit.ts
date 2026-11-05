import type { AuditAction } from "@/server/domain/audit";
import { isTechnicalAuditAction } from "@/server/domain/audit";
import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import { createLogger, type Logger } from "@/server/infra/logger";
import {
  createAuditLogRepository,
  type AuditLogFilters,
  type AuditLogRepository,
} from "@/server/repositories/audit-log-repository";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * Serviço de auditoria (M17): grava acções RF-AUD-03 com os campos RF-AUD-02 e
 * aplica a visibilidade de RF-AUD-04 (AUDITOR vê tudo; HR_MANAGER só negócio;
 * SYSTEM_ADMIN só técnico). Gravação falha para cima — auditoria nunca passa
 * em silêncio.
 */

export type RecordAuditInput = {
  actor: { userId: string | null; roles: string[] };
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  summary?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  diff?: Record<string, { antigo: string; novo: string }> | null;
};

export type AuditService = ReturnType<typeof createAuditService>;

export function createAuditService(
  prisma: PrismaClient,
  logger: Logger = createLogger(),
) {
  const repository: AuditLogRepository = createAuditLogRepository(prisma);

  return {
    /** Regista uma acção. R-11: toda a mudança de estado é auditada. */
    async record(input: RecordAuditInput) {
      const row = await repository.create({
        actorUserId: input.actor.userId,
        actorRoles: input.actor.roles,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        diffJson: input.diff ? JSON.stringify(input.diff) : null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
      });
      logger.debug(
        { auditId: String(row.id), action: input.action, correlationId: input.correlationId },
        "acção auditada",
      );
      return row;
    },

    /**
     * Lista com filtros e visibilidade por papel (RF-AUD-04). 403 se o principal
     * não tem `audit.view`; o conjunto de linhas é filtrado pela categoria.
     */
    async list(principal: Principal, filters: AuditLogFilters) {
      assertCan(principal, "audit.view");
      const roles = new Set(principal.roles.map((r) => r.role));
      let scoped: AuditLogFilters = { ...filters };
      if (roles.has("AUDITOR")) {
        // O auditor vê tudo (RF-AUD-04).
      } else if (roles.has("HR_MANAGER") && roles.has("SYSTEM_ADMIN")) {
        // Combinação vê ambos os conjuntos: sem filtro adicional.
      } else if (roles.has("HR_MANAGER")) {
        scoped = { ...scoped, onlyBusiness: true };
      } else if (roles.has("SYSTEM_ADMIN")) {
        scoped = { ...scoped, onlyTechnical: true };
      }
      return repository.list(scoped);
    },

    /** Exportação CSV do resultado filtrado (RF-AUD-04) — streaming cabe no Route Handler. */
    toCsv(rows: Awaited<ReturnType<AuditLogRepository["list"]>>["rows"]): string {
      const header = "id;occurredAt;actorUserId;actorRoles;action;entityType;entityId;summary;ipAddress;correlationId";
      const lines = rows.map((r) =>
        [
          String(r.id),
          r.occurredAt.toISOString(),
          r.actorUserId ?? "",
          r.actorRoles ?? "",
          r.action,
          r.entityType ?? "",
          r.entityId ?? "",
          r.summary ?? "",
          r.ipAddress ?? "",
          r.correlationId ?? "",
        ]
          .map((v) => v.replace(/;/g, ","))
          .join(";"),
      );
      return `${header}\n${lines.join("\n")}\n`;
    },

    /** Marca uma acção como técnica (para testes e para o visualizador). */
    isTechnical(action: AuditAction): boolean {
      return isTechnicalAuditAction(action);
    },
  };
}