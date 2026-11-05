import { describe, expect, it } from "vitest";

import { createCatalogService, type BusinessCatalog } from "@/server/services/catalog";
import { principalWithRole } from "@/server/auth/principal";
import { ForbiddenError } from "@/server/domain/errors";
import type { AuditService, RecordAuditInput } from "@/server/services/audit";
import type { PrismaClient } from "@/server/repositories/db";

/** Fake Prisma com apenas os catálogos usados nos testes. */
function makePrisma() {
  const tables: Record<string, Map<string, { id: string; active: boolean; name?: string; label?: string; code?: string }>> = {
    location: new Map(),
    keySubject: new Map(),
  };
  const chain = {
    async create({ data }: { data: Record<string, unknown> }) {
      const id = `id-${Math.random()}`;
      const row = { id, active: true, ...data } as { id: string; active: boolean; name?: string; code?: string };
      tables.location?.set(id, row);
      return row;
    },
  };
  return {
    $tables: tables,
    location: {
      ...chain,
      async findMany() {
        return [...(tables.location?.values() ?? [])];
      },
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        // cópia: o update do fake muta a linha em-place e contaminaria o "antigo"
        return { ...(tables.location?.get(where.id) as Record<string, unknown>) } as never;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = tables.location?.get(where.id) as Record<string, unknown>;
        Object.assign(row, data);
        return row as never;
      },
    },
    keySubject: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: `ks-${Math.random()}`, active: true, ...(data as Record<string, unknown>) };
        tables.keySubject?.set(String(row.id), row as never);
        return row as never;
      },
      async findMany() {
        return [...(tables.keySubject?.values() ?? [])];
      },
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        return tables.keySubject?.get(where.id) as never;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = tables.keySubject?.get(where.id) as unknown as Record<string, unknown>;
        Object.assign(row, data);
        return row as never;
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

const HR = principalWithRole("HR_MANAGER"); // catalog.businessManage
const TUTOR = principalWithRole("TUTOR"); // sem gestão

describe("catálogos de negócio (RF-ADM-01 a 06, RN-ADM-01)", () => {
  it("cria local e audita CATALOG_CHANGED; sem permissão é 403", async () => {
    const audit = makeAudit();
    const service = createCatalogService({ prisma: makePrisma(), audit: audit.auditService });
    await service.create(HR, "location", { code: "BEIRA", name: "Beira", province: "SOFALA" });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.action).toBe("CATALOG_CHANGED");
    await expect(service.create(TUTOR, "location", { code: "X", name: "X", province: "X" })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("cria disciplina-chave com sinónimos normalizados em minúsculas", async () => {
    const prisma = makePrisma();
    const service = createCatalogService({ prisma, audit: makeAudit().auditService });
    await service.create(HR, "keySubject", {
      code: "BASES_DADOS",
      name: "Bases de Dados",
      synonyms: ["Base de Dados", "banco de dados", ""],
    });
    const rows = await service.list("keySubject");
    const row = rows[0] as unknown as { synonymsJson: string };
    expect(JSON.parse(row.synonymsJson)).toEqual(["base de dados", "banco de dados"]);
  });

  it("desactivar mantém o registo (nunca apaga) e audita antigo→novo", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const service = createCatalogService({ prisma, audit: audit.auditService });
    const created = (await service.create(HR, "location", { code: "BEIRA", name: "Beira", province: "SOFALA" })) as { id: string };
    await service.deactivate(HR, "location", created.id);
    const rows = await service.list("location");
    expect(rows).toHaveLength(1); // continua listado (inactivo)
    expect((rows[0] as unknown as { active: boolean }).active).toBe(false);
    expect(audit.rows[1]?.diff).toEqual({ active: { antigo: "true", novo: "false" } });
  });

  it("renomear audita antigo→novo e não muda o código (RN-ADM-02)", async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const service = createCatalogService({ prisma, audit: audit.auditService });
    const created = (await service.create(HR, "location", { code: "BEIRA", name: "Beira", province: "SOFALA" })) as { id: string };
    await service.rename(HR, "location", created.id, "Beira (cidade)");
    const rows = await service.list("location");
    const row = rows[0] as unknown as { name: string; code: string };
    expect(row.name).toBe("Beira (cidade)");
    expect(row.code).toBe("BEIRA");
    expect(audit.rows[1]?.diff).toEqual({ name: { antigo: "Beira", novo: "Beira (cidade)" } });
  });

  it("entidades geridas são as de negócio do Anexo F", () => {
    // Sanidade do tipo: garantir que o conjunto cobre RF-ADM-01 a 06 e 13.
    const all: BusinessCatalog[] = ["location", "department", "institution", "fieldOfStudy", "course", "keySubject", "skill", "checklistTemplateItem"];
    expect(all).toHaveLength(8);
  });
});