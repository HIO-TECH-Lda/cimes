import { type Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  AUDIT_ACTIONS,
  isTechnicalAuditAction,
  type AuditAction,
} from "@/server/domain/audit";

/**
 * Auditoria (M17): `AuditLog` é só de acréscimo — este repositório não expõe
 * update nem delete (RF-AUD-01). As permissões de visualização são aplicadas
 * pelo serviço (`src/server/services/audit.ts`), com a matriz C.3.
 */

export type CreateAuditLogInput = {
  actorUserId: string | null;
  actorRoles: string[];
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  summary?: string;
  diffJson?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export type AuditLogFilters = {
  from?: Date;
  to?: Date;
  actorUserId?: string;
  actions?: AuditAction[];
  entityType?: string;
  entityId?: string;
  /** Filtrar por endereço IP (limites RF-AUT-07). */
  ipAddress?: string;
  /** Só acções técnicas (SYSTEM_ADMIN), só negócio (HR_MANAGER) ou todas (AUDITOR). */
  onlyTechnical?: boolean;
  onlyBusiness?: boolean;
  page?: number;
  pageSize?: number;
};

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>;

export function createAuditLogRepository(prisma: PrismaClient) {
  return {
    /** Acrescenta uma linha. Nenhuma operação de alteração existe aqui. */
    async create(input: CreateAuditLogInput) {
      return prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          actorRoles: input.actorRoles.length > 0 ? input.actorRoles.join(",") : null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          summary: input.summary ?? null,
          diffJson: input.diffJson ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          correlationId: input.correlationId ?? null,
        },
      });
    },

    /** Lista com filtros (RF-AUD-04), da mais recente para a mais antiga. */
    async list(filters: AuditLogFilters) {
      // Categoria (RF-AUD-04): só técnico (SYSTEM_ADMIN) ou só negócio (HR_MANAGER).
      let actions = filters.actions;
      if (filters.onlyTechnical) {
        const technical = AUDIT_ACTIONS.filter(isTechnicalAuditAction);
        actions = actions ? actions.filter((a) => technical.includes(a)) : technical;
      } else if (filters.onlyBusiness) {
        const business = AUDIT_ACTIONS.filter((a) => !isTechnicalAuditAction(a));
        actions = actions ? actions.filter((a) => business.includes(a)) : business;
      }
      const where: Prisma.AuditLogWhereInput = {
        occurredAt: {
          gte: filters.from ?? undefined,
          lte: filters.to ?? undefined,
        },
        actorUserId: filters.actorUserId || undefined,
        action: actions && actions.length > 0 ? { in: actions } : undefined,
        entityType: filters.entityType || undefined,
        entityId: filters.entityId || undefined,
        ipAddress: filters.ipAddress || undefined,
      };
      const pageSize = Math.min(filters.pageSize ?? 50, 200);
      const page = Math.max(filters.page ?? 1, 1);
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { occurredAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { total, page, pageSize, rows };
    },
  };
}