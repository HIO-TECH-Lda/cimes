import { MSSQLServerContainer } from "@testcontainers/mssqlserver";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { principalWithRole } from "@/server/auth/principal";
import { ForbiddenError } from "@/server/domain/errors";
import { TransitionError } from "@/server/domain/state-machines/opening";
import { createAuditService } from "@/server/services/audit";
import { createOpeningService } from "@/server/services/openings";
import { createSettingService } from "@/server/services/settings";

/**
 * Vagas contra a BD real (M03, RF-VAG-01 a 05): contador sequencial atómico
 * (VAG-AAAA-NNNN, inclusive em concorrência), fluxo D.2 completo com
 * transacções e notificações enfileiradas, e âmbitos do chefe (R-04).
 * Nenhum envio real: as notificações ficam PENDING na outbox.
 */

const KEY = Buffer.alloc(32, 9).toString("base64");
const SA_PASSWORD = "CimesIntTest!x";

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.FILE_STORAGE_PATH ??= path.join(process.cwd(), ".tmp-storage");
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ ktest: KEY });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_ENCRYPTION_KEYS ??= JSON.stringify({ ptest: KEY });
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "ptest";
process.env.PII_HMAC_KEY ??= KEY;
process.env.MAIL_TRANSPORT ??= "memory";

type Prisma = Awaited<ReturnType<typeof getClient>>;

let container: Awaited<ReturnType<typeof startContainer>>;
let prisma: Prisma;

async function startContainer() {
  return new MSSQLServerContainer("mcr.microsoft.com/mssql/server:2022-latest")
    .acceptLicense()
    .withPassword(SA_PASSWORD)
    .start();
}

async function getClient() {
  const { createPrismaClient } = await import("@/server/repositories/db");
  return createPrismaClient();
}

beforeAll(async () => {
  container = await startContainer();
  const url = `sqlserver://${container.getHost()}:${container.getPort()};database=${container.getDatabase()};user=${container.getUsername()};password=${encodeURIComponent(SA_PASSWORD)};encrypt=false;trustServerCertificate=true`;
  process.env.DATABASE_URL = url;
  process.env.DATABASE_MIGRATION_URL = url;

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MIGRATION_URL: url },
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy falhou:\n${result.stdout}\n${result.stderr}`);
  }
  prisma = await getClient();

  // Catálogo mínimo e utilizadores sintéticos com papéis.
  await prisma.location.create({ data: { id: "loc-beira", code: "BEIRA", name: "Beira", province: "SOFALA" } });
  await prisma.department.create({ data: { id: "dep-ict", code: "ICT", name: "Tecnologias de Informação", locationId: "loc-beira" } });
  await prisma.department.create({ data: { id: "dep-fin", code: "FIN", name: "Finanças", locationId: "loc-beira" } });
  await prisma.course.create({
    data: { id: "course-log", code: "LOG-LIC", name: "Logística", level: "LICENCIATURA", fieldOfStudyId: (await prisma.fieldOfStudy.create({ data: { id: "fs-log", code: "LOG", name: "Logística" } })).id },
  });
  await prisma.keySubject.create({ data: { id: "ks-suprimentos", code: "SUPRIMENTOS", name: "Gestão de Suprimentos", synonymsJson: "[]" } });
  await prisma.skill.create({ data: { id: "sk-excel", code: "EXCEL", name: "Excel", synonymsJson: "[]" } });
  await prisma.user.create({ data: { id: "user-1", name: "Chefe Sintético", email: "chefe@cimes.test", emailVerified: true, userType: "STAFF" } });
  await prisma.user.create({ data: { id: "user-rh", name: "RH Sintético", email: "rh@cimes.test", emailVerified: true, userType: "STAFF" } });
  await prisma.user.create({ data: { id: "user-gestor", name: "Gestor RH Sintético", email: "gestor-rh@cimes.test", emailVerified: true, userType: "STAFF" } });
  await prisma.roleAssignment.create({ data: { userId: "user-1", role: "DEPARTMENT_HEAD", departmentId: "dep-ict", grantedById: "user-gestor", validFrom: new Date("2026-01-01") } });
  await prisma.roleAssignment.create({ data: { userId: "user-rh", role: "HR_OFFICER", grantedById: "user-gestor", validFrom: new Date("2026-01-01") } });
  await prisma.roleAssignment.create({ data: { userId: "user-gestor", role: "HR_MANAGER", grantedById: "user-gestor", validFrom: new Date("2026-01-01") } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop({ timeout: 10_000 });
});

let AGORA = new Date("2027-03-01T09:00:00.000Z");

function servico() {
  return createOpeningService({
    prisma,
    audit: createAuditService(prisma),
    settings: createSettingService({ prisma, audit: createAuditService(prisma) }),
    clock: { now: () => new Date(AGORA.getTime()) },
  });
}

function rascunho(departamento = "dep-ict") {
  return {
    title: "Estágio em Logística Portuária",
    departmentId: departamento,
    locationId: "loc-beira",
    positions: 2,
    description: "Apoio à gestão de contentores no terminal.",
    requirements: "Frequência universitária em logística.",
    acceptsFinalists: true,
    acceptsGraduates: false,
    courseIds: ["course-log"],
    fieldOfStudyIds: [],
    durationMonths: 6,
    expectedStartDate: new Date("2027-04-01"),
    keySubjects: [{ keySubjectId: "ks-suprimentos", weight: 3 }],
    skills: [{ skillId: "sk-excel", required: true, weight: 4 }],
    scoringWeights: { academic: 60, keySubjects: 20, skills: 20 },
  };
}

const JANELA = {
  applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
  applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
};

describe("vagas contra BD real (M03)", () => {
  it("contador sequencial: dois pedidos no mesmo ano levam códigos 0001 e 0002", async () => {
    const service = servico();
    const a = await service.create(principalWithRole("HR_OFFICER"), rascunho());
    const b = await service.create(principalWithRole("HR_OFFICER"), rascunho());
    expect(a.code).toBe("VAG-2027-0001");
    expect(b.code).toBe("VAG-2027-0002");
    const contador = await prisma.sequenceCounter.findUnique({ where: { code: "VAG-2027" } });
    expect(contador?.value).toBe(2);
  });

  it("chefe não cria para outro departamento (C.3, DEPARTMENT)", async () => {
    const service = servico();
    await expect(
      service.create(principalWithRole("DEPARTMENT_HEAD", "dep-ict"), rascunho("dep-fin")),
    ).rejects.toThrow(ForbiddenError);
  });

  it("fluxo D.2 completo: submeter → N-21; aprovar → N-22; publicar → PUBLISHED", async () => {
    const service = servico();
    const criada = await service.create(principalWithRole("DEPARTMENT_HEAD", "dep-ict"), rascunho());
    await service.submit(principalWithRole("DEPARTMENT_HEAD", "dep-ict"), criada.id);

    // Só o Gestor de RH aprecia; o RH_OFFICER não pode (D.2).
    await expect(service.approve(principalWithRole("HR_OFFICER"), criada.id)).rejects.toThrow(TransitionError);
    await service.approve(principalWithRole("HR_MANAGER"), criada.id);
    await service.publish(principalWithRole("HR_OFFICER"), criada.id, JANELA);

    const linha = await prisma.opening.findUnique({ where: { id: criada.id } });
    expect(linha?.status).toBe("PUBLISHED");
    expect(linha?.applicationCloseAt).toEqual(JANELA.applicationCloseAt);

    // N-21 ao RH (2 destinatários: officer e manager) e N-22 ao chefe.
    const n21 = await prisma.notification.findMany({ where: { templateCode: "N-21", payloadJson: { contains: criada.code } } });
    expect(n21).toHaveLength(2);
    const n22 = await prisma.notification.findFirst({ where: { templateCode: "N-22", payloadJson: { contains: criada.code } } });
    expect(n22?.recipientEmail).toBe("chefe@cimes.test");

    // Auditoria das três mudanças de estado.
    const auditoria = await prisma.auditLog.count({ where: { action: "OPENING_STATUS_CHANGED", entityId: criada.id } });
    expect(auditoria).toBeGreaterThanOrEqual(3);
  });

  it("transição inválida é recusada com concorrência controlada (updateMany condicional)", async () => {
    const service = servico();
    const criada = await service.create(principalWithRole("HR_OFFICER"), rascunho());
    await expect(service.publish(principalWithRole("HR_OFFICER"), criada.id, JANELA)).rejects.toThrow(TransitionError);
    // Rascunho → SUBMITTED por dois caminhos: um passa, o outro apanha 409 lógico.
    const resultados = await Promise.allSettled([
      service.submit(principalWithRole("DEPARTMENT_HEAD", "dep-ict"), criada.id),
      service.submit(principalWithRole("HR_OFFICER"), criada.id),
    ]);
    expect(resultados.map((r) => r.status)).toContain("fulfilled");
    const linha = await prisma.opening.findUnique({ where: { id: criada.id } });
    expect(linha?.status).toBe("SUBMITTED");
    expect(linha?.version).toBe(2); // criação (1) + submissão
  });

  it("fecho automático fecha a vaga cuja janela venceu (actor SYSTEM, auditada)", async () => {
    const service = servico();
    const criada = await service.create(principalWithRole("HR_OFFICER"), rascunho());
    await service.submit(principalWithRole("HR_OFFICER"), criada.id);
    await service.approve(principalWithRole("HR_MANAGER"), criada.id);
    await service.publish(principalWithRole("HR_OFFICER"), criada.id, {
      applicationOpenAt: new Date("2027-02-20T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-05T17:00:00.000Z"),
    });
    // O tempo passa do prazo…
    AGORA = new Date("2027-03-06T09:00:00.000Z");
    const fechadas = await service.closeExpired();
    expect(fechadas).toEqual([criada.code]);
    const linha = await prisma.opening.findUnique({ where: { id: criada.id } });
    expect(linha?.status).toBe("CLOSED");
    const auditoria = await prisma.auditLog.findFirst({
      where: { action: "OPENING_STATUS_CHANGED", entityId: criada.id, actorUserId: null },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditoria?.summary).toContain("automaticamente");
  });
});