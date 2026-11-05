import { describe, expect, it } from "vitest";

import { createSettingService } from "@/server/services/settings";
import { principalWithRole } from "@/server/auth/principal";
import { ForbiddenError } from "@/server/domain/errors";
import type { AuditService, RecordAuditInput } from "@/server/services/audit";
import type { PrismaClient } from "@/server/repositories/db";

/** Fake do repositório Setting em memória. */
function makePrisma() {
  const rows = new Map<string, { code: string; valueJson: string; updatedById: string | null }>();
  return {
    setting: {
      async findUnique({ where }: { where: { code: string } }) {
        return rows.get(where.code) ?? null;
      },
      async findMany() {
        return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { code: string };
        create: { code: string; valueJson: string; updatedById?: string };
        update: { valueJson: string; updatedById?: string };
      }) {
        const existing = rows.get(where.code);
        const next = existing
          ? { ...existing, valueJson: update.valueJson, updatedById: update.updatedById ?? null }
          : { code: create.code, valueJson: create.valueJson, updatedById: create.updatedById ?? null };
        rows.set(where.code, next);
        return next;
      },
    },
  } as unknown as PrismaClient;
}

function makeAudit() {
  const rows: RecordAuditInput[] = [];
  const auditService = {
    async record(input: RecordAuditInput) {
      rows.push(input);
    },
  } as unknown as AuditService;
  return { rows, auditService };
}

const ADMIN = principalWithRole("HR_MANAGER"); // settings.manage: HR_MANAGER:ALL
const AUDITOR = principalWithRole("AUDITOR"); // sem settings.manage

describe("parâmetros do sistema (RF-ADM-11)", () => {
  it("listar exige settings.manage (AUDITOR é 403)", async () => {
    const service = createSettingService({ prisma: makePrisma(), audit: makeAudit().auditService });
    await expect(service.list(ADMIN)).resolves.toBeInstanceOf(Array);
    await expect(service.list(AUDITOR)).rejects.toThrow(ForbiddenError);
  });

  it("altera um parâmetro válido e audita SETTING_CHANGED com antigo→novo", async () => {
    const audit = makeAudit();
    const service = createSettingService({ prisma: makePrisma(), audit: audit.auditService });
    await service.update(ADMIN, "candidate.maxActiveApplications", "2");
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.action).toBe("SETTING_CHANGED");
    expect(audit.rows[0]?.entityId).toBe("candidate.maxActiveApplications");
    const after = await service.get("candidate.maxActiveApplications");
    expect(after).toBe("2");
  });

  it("rejeita valor fora do contrato sem gravar nem auditar", async () => {
    const audit = makeAudit();
    const service = createSettingService({ prisma: makePrisma(), audit: audit.auditService });
    await expect(
      service.update(ADMIN, "candidate.maxActiveApplications", "99"),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      service.update(ADMIN, "catalogo.inexistente", "1"),
    ).rejects.toThrow(ForbiddenError);
    expect(audit.rows).toHaveLength(0);
  });

  it("valor igual não gera segunda auditoria", async () => {
    const audit = makeAudit();
    const service = createSettingService({ prisma: makePrisma(), audit: audit.auditService });
    await service.update(ADMIN, "average.passMark", "10");
    await service.update(ADMIN, "average.passMark", "10");
    expect(audit.rows).toHaveLength(1);
  });
});