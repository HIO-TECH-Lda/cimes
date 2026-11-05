import { describe, expect, it } from "vitest";

import { observedDate } from "@/server/domain/holidays";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { createHolidayService } from "@/server/services/holidays";
import { principalWithRole } from "@/server/auth/principal";
import type { AuditService, RecordAuditInput } from "@/server/services/audit";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * RF-ADM-07 (F.7): regra domingo → segunda seguinte; feriados nacionais e
 * locais; sem duplicados; gestão por RH-G/ADM (catalog.technicalManage).
 */

const RH = principalWithRole("HR_MANAGER");
const ADM = principalWithRole("SYSTEM_ADMIN");
const TUTOR = principalWithRole("TUTOR");

function fakePrisma() {
  const feriados = new Map<string, { id: string; holidayDate: Date; observedDate: Date; name: string; scope: string; locationId: string | null }>();
  const locals = new Map<string, { id: string; active: boolean }>([
    ["MPC", { id: "loc-mpc", active: true }],
  ]);
  let seq = 0;
  const prisma = {
    holiday: {
      async findMany({ orderBy }: { orderBy?: unknown }) {
        const all = [...feriados.values()];
        void orderBy;
        return all.sort((a, b) => b.holidayDate.getTime() - a.holidayDate.getTime());
      },
      async findFirst({ where }: { where: { holidayDate: Date; scope: string; locationId: string | null } }) {
        return (
          [...feriados.values()].find(
            (f) =>
              f.holidayDate.getTime() === where.holidayDate.getTime() &&
              f.scope === where.scope &&
              f.locationId === where.locationId,
          ) ?? null
        );
      },
      async findUnique({ where }: { where: { id: string } }) {
        return feriados.get(where.id) ?? null;
      },
      async create({ data }: { data: { holidayDate: Date; observedDate: Date; name: string; scope: string; locationId: string | null } }) {
        seq++;
        const row = { id: `feriado-novo-${seq}`, ...data };
        feriados.set(row.id, row);
        return row;
      },
      async delete({ where }: { where: { id: string } }) {
        feriados.delete(where.id);
      },
    },
    location: {
      async findUnique({ where }: { where: { code: string } }) {
        return locals.get(where.code) ?? null;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, feriados };
}

function fakeAudit() {
  const rows: RecordAuditInput[] = [];
  const audit = { async record(input: RecordAuditInput) { rows.push(input); } } as unknown as AuditService;
  return { rows, audit };
}

describe("observedDate (domingo → segunda, Anexo F)", () => {
  it("domingo observa-se na segunda seguinte", () => {
    // 2027-06-06 é domingo (viaja no UTC; usar 13h para evitar ambiguidades).
    const domingo = new Date("2027-06-06T12:00:00Z");
    expect(domingo.getUTCDay()).toBe(0);
    const observado = observedDate(domingo);
    expect(observado.toISOString().slice(0, 10)).toBe("2027-06-07");
  });

  it("dia que não é domingo mantém-se", () => {
    const sabado = new Date("2027-06-05T12:00:00Z");
    expect(observedDate(sabado).toISOString().slice(0, 10)).toBe("2027-06-05");
  });
});

describe("serviço de feriados (RF-ADM-07)", () => {
  it("sem permissão (TUTOR), listar e criar são negados", async () => {
    const { prisma } = fakePrisma();
    const { audit } = fakeAudit();
    const service = createHolidayService({ prisma, audit });
    await expect(service.list(TUTOR)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      service.create(TUTOR, { holidayDate: "2027-06-06", name: "X", scope: "NATIONAL" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("RH-G e ADM criam feriado nacional; domingo é observado na segunda", async () => {
    const { prisma, feriados } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createHolidayService({ prisma, audit });
    let dia = 6;
    for (const principal of [RH, ADM]) {
      const criado = await service.create(principal, {
        holidayDate: `2027-06-0${dia}`,
        name: "Feriado Sintético de Junho",
        scope: "NATIONAL",
      });
      // dia 6 é domingo (observa na segunda 7); dia 7 já é segunda (fica).
      expect(criado.observedDate.toISOString().slice(0, 10)).toBe("2027-06-07");
      expect(feriados.size).toBeGreaterThan(0);
      expect(auditRows.at(-1)?.action).toBe("CATALOG_CHANGED");
      dia++;
    }
  });

  it("feriado LOCAL exige local activo; duplicado é recusado", async () => {
    const { prisma, feriados } = fakePrisma();
    const { audit } = fakeAudit();
    const service = createHolidayService({ prisma, audit });

    await expect(
      service.create(RH, { holidayDate: "2027-07-01", name: "Local sem local", scope: "LOCAL" }),
    ).rejects.toThrow(/Local inexistente/);

    await service.create(RH, { holidayDate: "2027-07-01", name: "Aniversário da Beira", scope: "LOCAL", locationCode: "MPC" });
    expect(feriados.size).toBe(1);
    await expect(
      service.create(RH, { holidayDate: "2027-07-01", name: "Outro com o mesmo dia", scope: "LOCAL", locationCode: "MPC" }),
    ).rejects.toThrow(/Já existe/);
    expect(feriados.size).toBe(1);
  });

  it("data inválida é recusada; eliminar remove e audita; inexistente é 404", async () => {
    const { prisma, feriados } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createHolidayService({ prisma, audit });

    await expect(
      service.create(RH, { holidayDate: "01-07-2027", name: "X", scope: "NATIONAL" }),
    ).rejects.toThrow(/Data inválida/);

    const criado = await service.create(RH, { holidayDate: "2027-12-25", name: "Natal", scope: "NATIONAL" });
    await service.remove(RH, criado.id);
    expect(feriados.size).toBe(0);
    expect(auditRows.at(-1)?.summary).toContain("eliminado");
    await expect(service.remove(RH, "inexistente")).rejects.toBeInstanceOf(NotFoundError);
  });
});