import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/server/domain/errors";
import {
  DIRECTORY_CSV_TEMPLATE,
  createStaffDirectoryService,
  parseDirectoryCsv,
} from "@/server/services/staff-directory";
import { principalWithRole } from "@/server/auth/principal";
import type { AuditService, RecordAuditInput } from "@/server/services/audit";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * RF-ADM-12 + RN-ADM-03: parser do CSV do directório (BOM, separador,
 * cabeçalhos fixos, relatório por linha) e serviço com simulação que não
 * grava, importação idempotente por e-mail e auditoria IMPORT_EXECUTED.
 */

const ADMIN = principalWithRole("HR_MANAGER"); // staffDirectory.import: HR_MANAGER:ALL
const SEM_PAPEL = principalWithRole("TUTOR");

function fakePrisma() {
  const perfis = new Map<
    string,
    { id: string; email: string; employeeNumber: string; fullName: string; departmentId: string; jobTitle: string | null; active: boolean; userId: string | null }
  >();
  const departamentos = new Map<string, { id: string; code: string; active: boolean }>([
    ["dep-ict", { id: "dep-ict", code: "ICT", active: true }],
    ["dep-rh", { id: "dep-rh", code: "RH", active: true }],
  ]);
  const users = new Map<string, { id: string; email: string }>([
    ["user-1", { id: "user-1", email: "ana.exemplo@exemplo.mz" }],
  ]);
  let seq = 0;
  const prisma = {
    department: {
      async findMany({ where }: { where: { code: { in: string[] } } }) {
        return [...departamentos.values()].filter((d) => where.code.in.includes(d.code));
      },
    },
    staffProfile: {
      async findMany({ where }: { where: { email?: { in: string[] }; employeeNumber?: { in: string[] } } }) {
        const todas = [...perfis.values()];
        if (where.email) return todas.filter((p) => where.email?.in.includes(p.email));
        return todas.filter((p) => where.employeeNumber?.in.includes(p.employeeNumber));
      },
      async upsert({ where, create, update }: { where: { email: string }; create: Record<string, unknown>; update: Record<string, unknown> }) {
        const existente = perfis.get(where.email);
        if (existente) {
          Object.assign(existente, update);
          return existente;
        }
        seq++;
        const novo = { id: `perfil-${seq}`, active: true, userId: null, ...create } as {
          id: string; email: string; employeeNumber: string; fullName: string; departmentId: string; jobTitle: string | null; active: boolean; userId: string | null;
        };
        perfis.set(novo.email, novo);
        return novo;
      },
    },
    user: {
      async findMany({ where }: { where: { email: { in: string[] } } }) {
        return [...users.values()].filter((u) => where.email.in.includes(u.email));
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(prisma);
    },
  } as unknown as PrismaClient;
  return { prisma, perfis };
}

function fakeAudit() {
  const rows: RecordAuditInput[] = [];
  const audit = { async record(input: RecordAuditInput) { rows.push(input); } } as unknown as AuditService;
  return { rows, audit };
}

const CSV_OK =
  "numero_colaborador;nome;email;codigo_departamento;cargo\n" +
  "1001;Ana Exemplo Sintética;ana.exemplo@exemplo.mz;ICT;Técnica\n" +
  "1002;Bruno Exemplo Sintético;bruno.exemplo@exemplo.mz;RH;\n";

describe("parseDirectoryCsv (RN-ADM-03)", () => {
  it("o modelo do Anexo F é aceite e devolve 2 linhas", () => {
    const r = parseDirectoryCsv(CSV_OK);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.email).toBe("ana.exemplo@exemplo.mz");
    expect(r.rows[0]?.jobTitle).toBe("Técnica");
    expect(r.rows[1]?.jobTitle).toBeNull();
    expect(r.erros).toHaveLength(0);
    expect(DIRECTORY_CSV_TEMPLATE.startsWith("numero_colaborador;nome;email;codigo_departamento;cargo")).toBe(true);
  });

  it("aceita UTF-8 com BOM e separador vírgula", () => {
    const comVirgula = CSV_OK.replaceAll(";", ",");
    const r = parseDirectoryCsv("\uFEFF" + comVirgula);
    expect(r.rows).toHaveLength(2);
    expect(r.separador).toBe(",");
  });

  it("rejeita cabeçalhos diferentes dos fixos do Anexo F", () => {
    expect(() => parseDirectoryCsv("a;b;c;d;e\n1;2;3;4;5\n")).toThrow(/Cabeçalhos inválidos/);
  });

  it("rejeita ficheiro vazio", () => {
    expect(() => parseDirectoryCsv("   \n")).toThrow(/vazio/);
  });

  it("reporta por linha: e-mail inválido, duplicado no ficheiro e colunas a mais", () => {
    const csv =
      "numero_colaborador;nome;email;codigo_departamento;cargo\n" +
      "1003;C;ana2@exemplo.mz;ICT;\n" +
      "1004;D;nao-e-email;ICT;\n" +
      "1005;E;ana2@exemplo.mz;ICT;\n" +
      "1006;F;x;y;z;w\n";
    const r = parseDirectoryCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.linha).toBe(2);
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4, 5]);
    expect(r.erros[0]?.mensagem).toMatch(/inválido/);
    expect(r.erros[1]?.mensagem).toMatch(/duplicado/);
    expect(r.erros[2]?.mensagem).toMatch(/colunas/);
  });
});

describe("serviço do directório (RF-ADM-12)", () => {
  it("sem permissão, simulação e importação são negadas", async () => {
    const { prisma } = fakePrisma();
    const { audit } = fakeAudit();
    const service = createStaffDirectoryService({ prisma, audit });
    await expect(service.simulate(SEM_PAPEL, CSV_OK)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.import(SEM_PAPEL, CSV_OK)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("simulação devolve o plano e não grava nada", async () => {
    const { prisma, perfis } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createStaffDirectoryService({ prisma, audit });
    const r = await service.simulate(ADMIN, CSV_OK);
    expect(r.criados).toBe(2);
    expect(r.actualizados).toBe(0);
    expect(r.erros).toBe(0);
    expect(perfis.size).toBe(0);
    expect(auditRows).toHaveLength(0);
  });

  it("importação cria, é idempotente por e-mail e liga o utilizador existente", async () => {
    const { prisma, perfis } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createStaffDirectoryService({ prisma, audit });

    const primeira = await service.import(ADMIN, CSV_OK);
    expect(primeira.criados).toBe(2);
    expect(perfis.get("ana.exemplo@exemplo.mz")?.userId).toBe("user-1");
    expect(perfis.get("ana.exemplo@exemplo.mz")?.departmentId).toBe("dep-ict");

    const segunda = await service.import(ADMIN, CSV_OK);
    expect(segunda.actualizados).toBe(2);
    expect(segunda.criados).toBe(0);
    expect(perfis.size).toBe(2);
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0]?.action).toBe("IMPORT_EXECUTED");
    expect(JSON.stringify(auditRows[0])).not.toContain("@exemplo.mz"); // e-mails não entram em auditoria (R-09)
  });

  it("linha com departamento inexistente vai ao relatório; as válidas importam", async () => {
    const { prisma, perfis } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createStaffDirectoryService({ prisma, audit });
    const csv =
      "numero_colaborador;nome;email;codigo_departamento;cargo\n" +
      "1010;F;f@exemplo.mz;XXX;\n" +
      "1011;G;g@exemplo.mz;RH;\n";
    const r = await service.import(ADMIN, csv);
    expect(r.erros).toBe(1);
    expect(r.criados).toBe(1);
    expect(perfis.size).toBe(1);
    expect(auditRows[0]?.summary).toContain("1 erros");
  });

  it("número de colaborador usado por outro e-mail é recusado na linha", async () => {
    const { prisma, perfis } = fakePrisma();
    const { rows: auditRows, audit } = fakeAudit();
    const service = createStaffDirectoryService({ prisma, audit });
    await service.import(ADMIN, CSV_OK);
    const csv =
      "numero_colaborador;nome;email;codigo_departamento;cargo\n" +
      "1001;Outro Exemplo;outro@exemplo.mz;ICT;\n";
    const r = await service.import(ADMIN, csv);
    expect(r.erros).toBe(1);
    expect(r.linhas.find((l) => l.estado === "erro")?.mensagem).toMatch(/número de colaborador/);
    expect(perfis.size).toBe(2);
    expect(auditRows).toHaveLength(2);
  });
});