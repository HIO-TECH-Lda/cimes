import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import type { PrismaClient } from "@/server/repositories/db";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { observedDate } from "@/server/domain/holidays";
import type { AuditService } from "@/server/services/audit";

/**
 * Catálogo técnico de feriados (RF-ADM-07): feriados nacionais (Moçambique,
 * F.7) e locais (por local do catálogo técnico). A observância domingo →
 * segunda-feira seguinte é calculada pelo domínio, nunca pelo cliente.
 * Gestão é do Gestor de RH e do SYSTEM_ADMIN (`catalog.technicalManage`,
 * C.3); tudo auditado (CATALOG_CHANGED).
 */

export type HolidayScope = "NATIONAL" | "LOCAL";

export type HolidayService = ReturnType<typeof createHolidayService>;

export function createHolidayService(
  deps: { prisma: PrismaClient; audit: AuditService },
) {
  const prisma = deps.prisma;

  function assertTechnical(principal: Principal): void {
    assertCan(principal, "catalog.technicalManage");
  }

  async function recordChange(
    principal: Principal,
    entityId: string,
    summary: string,
  ): Promise<void> {
    await deps.audit.record({
      actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
      action: "CATALOG_CHANGED",
      entityType: "holiday",
      entityId,
      summary,
      diff: null,
    });
  }

  return {
    /** Lista completa, do mais recente para o mais antigo. */
    async list(principal: Principal) {
      assertTechnical(principal);
      return prisma.holiday.findMany({
        orderBy: [{ holidayDate: "desc" }, { name: "asc" }],
        take: 500,
        include: { location: { select: { code: true, name: true } } },
      });
    },

    /** Locais activos (para o selector do âmbito LOCAL). */
    async locations(principal: Principal) {
      assertTechnical(principal);
      return prisma.location.findMany({
        where: { active: true },
        select: { code: true, name: true },
        orderBy: { code: "asc" },
        take: 500,
      });
    },

    /**
     * Cria um feriado (NATIONAL sem local, LOCAL com código do local);
     * rejeita duplicados (mesma data, âmbito e local) e audita.
     */
    async create(
      principal: Principal,
      data: { holidayDate: string; name: string; scope: string; locationCode?: string },
    ) {
      assertTechnical(principal);

      const date = new Date(`${data.holidayDate}T00:00:00Z`);
      if (Number.isNaN(date.getTime()) || data.holidayDate.length !== 10) {
        throw new ForbiddenError("Data inválida (esperada aaaa-mm-dd)");
      }
      const name = data.name.trim();
      if (name.length === 0 || name.length > 120) {
        throw new ForbiddenError("Nome do feriado inválido");
      }
      const scope = data.scope === "LOCAL" ? "LOCAL" : "NATIONAL";

      let locationId: string | null = null;
      if (scope === "LOCAL") {
        const location = await prisma.location.findUnique({
          where: { code: data.locationCode ?? "" },
          select: { id: true, active: true },
        });
        if (!location || !location.active) {
          throw new ForbiddenError("Local inexistente ou inactivo");
        }
        locationId = location.id;
      }

      const duplicado = await prisma.holiday.findFirst({
        where: {
          holidayDate: date,
          scope,
          locationId,
        },
        select: { id: true },
      });
      if (duplicado) {
        throw new ForbiddenError("Já existe um feriado com essa data, âmbito e local");
      }

      const created = await prisma.holiday.create({
        data: {
          holidayDate: date,
          observedDate: observedDate(date),
          name,
          scope,
          locationId,
        },
      });

      await recordChange(principal, created.id, `feriado criado (${scope})`);
      return created;
    },

    /** Remove um feriado (catálogo de datas, sem referências no MVP) e audita. */
    async remove(principal: Principal, id: string) {
      assertTechnical(principal);
      const existing = await prisma.holiday.findUnique({ where: { id }, select: { id: true, name: true } });
      if (!existing) throw new NotFoundError("Feriado inexistente");
      await prisma.holiday.delete({ where: { id } });
      await recordChange(principal, id, "feriado eliminado");
    },
  };
}