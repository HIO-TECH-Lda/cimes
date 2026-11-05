/**
 * Seeds do CIMES (Anexo F, R-01): catálogos iniciais sintéticos (F.1 a F.8),
 * parâmetros por omissão (RF-ADM-11) e utilizadores/papéis de desenvolvimento
 * sintéticos. Nunca dados reais. Idempotente (upsert por código).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import dotenv from "dotenv";

// Precedência igual a prisma.config.ts: processo > .env.local > .env.
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { parseSqlserverUrl } from "../../src/server/infra/db-config";
import { parseCsv, synonymsToJson, observedDate } from "./csv";
import { defaultSettings } from "../../src/server/domain/settings";

const dataDir = join(import.meta.dirname, "data");

function readData(file: string): string {
  return readFileSync(join(dataDir, file), "utf8");
}

async function seedCatalogs(prisma: PrismaClient): Promise<void> {
  // F.1 Locais (P-25)
  for (const row of parseCsv(readData("locais.csv"))) {
    await prisma.location.upsert({
      where: { code: row["codigo"] as string },
      create: { code: row["codigo"] as string, name: row["nome"] as string, province: row["provincia"] as string },
      update: { name: row["nome"] as string, province: row["provincia"] as string, active: true },
    });
  }

  // F.2 Departamentos (P-26) — referenciam locais por código
  for (const row of parseCsv(readData("departamentos.csv"))) {
    const location = await prisma.location.findUnique({ where: { code: row["codigo_local"] as string } });
    if (!location) throw new Error(`Local inexistente no seed: ${row["codigo_local"]}`);
    await prisma.department.upsert({
      where: { code: row["codigo"] as string },
      create: { code: row["codigo"] as string, name: row["nome"] as string, locationId: location.id },
      update: { name: row["nome"] as string, locationId: location.id, active: true },
    });
  }

  // F.3 Instituições (P-27)
  for (const row of parseCsv(readData("instituicoes.csv"))) {
    const province = row["provincia"];
    await prisma.institution.upsert({
      where: { code: row["codigo"] as string },
      create: {
        code: row["codigo"] as string,
        name: row["nome"] as string,
        acronym: (row["sigla"] as string).length > 0 ? row["sigla"] : null,
        kind: row["tipo"] as string,
        province: (province as string).length > 0 ? province : null,
      },
      update: {
        name: row["nome"] as string,
        acronym: (row["sigla"] as string).length > 0 ? row["sigla"] : null,
        kind: row["tipo"] as string,
        province: (province as string).length > 0 ? province : null,
        active: true,
      },
    });
  }

  // F.4 Áreas de formação e cursos (nível LICENCIATURA)
  for (const row of parseCsv(readData("areas_cursos.csv"))) {
    const field = await prisma.fieldOfStudy.upsert({
      where: { code: row["area_codigo"] as string },
      create: { code: row["area_codigo"] as string, name: row["area_nome"] as string },
      update: { name: row["area_nome"] as string, active: true },
    });
    await prisma.course.upsert({
      where: { code: row["curso_codigo"] as string },
      create: {
        code: row["curso_codigo"] as string,
        name: row["curso_nome"] as string,
        level: "LICENCIATURA",
        fieldOfStudyId: field.id,
      },
      update: { name: row["curso_nome"] as string, level: "LICENCIATURA", fieldOfStudyId: field.id, active: true },
    });
  }

  // F.5 Disciplinas-chave (P-28, sinónimos já normalizados)
  for (const row of parseCsv(readData("disciplinas.csv"))) {
    await prisma.keySubject.upsert({
      where: { code: row["codigo"] as string },
      create: { code: row["codigo"] as string, name: row["nome"] as string, synonymsJson: synonymsToJson(row["sinonimos"] as string) },
      update: { name: row["nome"] as string, synonymsJson: synonymsToJson(row["sinonimos"] as string), active: true },
    });
  }

  // F.6 Competências
  for (const row of parseCsv(readData("competencias.csv"))) {
    const category = row["categoria"];
    await prisma.skill.upsert({
      where: { code: row["codigo"] as string },
      create: {
        code: row["codigo"] as string,
        name: row["nome"] as string,
        category: (category as string).length > 0 ? category : null,
        synonymsJson: synonymsToJson(row["sinonimos"] as string),
      },
      update: {
        name: row["nome"] as string,
        category: (category as string).length > 0 ? category : null,
        synonymsJson: synonymsToJson(row["sinonimos"] as string),
        active: true,
      },
    });
  }

  // F.7 Feriados nacionais 2026–2028 (domingo → segunda seguinte)
  const years = [2026, 2027, 2028];
  for (const row of parseCsv(readData("feriados.csv"))) {
    for (const year of years) {
      const holidayDate = new Date(Date.UTC(year, Number(row["mes"]) - 1, Number(row["dia"])));
      const observed = observedDate(holidayDate);
      await prisma.holiday.upsert({
        where: { id: `feriado-${year}-${String(row["mes"]).padStart(2, "0")}-${String(row["dia"]).padStart(2, "0")}` },
        create: { id: `feriado-${year}-${String(row["mes"]).padStart(2, "0")}-${String(row["dia"]).padStart(2, "0")}`, holidayDate, observedDate: observed, name: row["nome"] as string, scope: "NATIONAL" },
        update: { name: row["nome"] as string, observedDate: observed },
      });
    }
  }

  // F.8 Checklist de acolhimento
  const checklistRows = parseCsv(readData("checklist.csv"));
  for (const [index, row] of checklistRows.entries()) {
    await prisma.checklistTemplateItem.upsert({
      where: { code: row["codigo"] as string },
      create: { code: row["codigo"] as string, label: row["item"] as string, ownerRole: row["responsavel"] as string, sortOrder: index + 1 },
      update: { label: row["item"] as string, ownerRole: row["responsavel"] as string, sortOrder: index + 1, active: true },
    });
  }

  // Parâmetros por omissão (RF-ADM-11): não sobrescrevem valores alterados.
  for (const setting of defaultSettings()) {
    await prisma.setting.upsert({
      where: { code: setting.code },
      create: { code: setting.code, valueJson: setting.valueJson },
      update: {},
    });
  }

  // Aviso de privacidade em vigor (RF-AUT-03/R-09): texto sintético de referência.
  await prisma.privacyNoticeVersion.upsert({
    where: { version: "2026-01" },
    create: {
      version: "2026-01",
      title: "Aviso de privacidade do programa de estágios (dados sintéticos de demonstração)",
      bodyMarkdown:
        "Texto de demonstração (R-01). Descreve finalidades, bases de licitude, prazos de conservação e direitos do titular. Substituir pelo aviso oficial antes de produção.",
      status: "PUBLISHED",
      publishedAt: new Date("2026-01-15T09:00:00Z"),
    },
    update: {},
  });

  // Idiomas ficam no parâmetro catalog.languages (configurável, F.6).
}

/** Utilizadores sintéticos de desenvolvimento (R-01) com papéis (RF-AUT-09). */
async function seedDevUsers(prisma: PrismaClient): Promise<void> {
  const { getAuth } = await import("../../src/server/auth/better-auth");
  const auth = getAuth();
  const password = "Cimes!Dev2026";

  const devUsers = [
    { email: "admin@exemplo.mz", name: "Admin Sintético", role: "SYSTEM_ADMIN", department: null },
    { email: "rh.gestor@exemplo.mz", name: "Gestor de RH Sintético", role: "HR_MANAGER", department: null },
    { email: "rh.oficial@exemplo.mz", name: "Oficial de RH Sintético", role: "HR_OFFICER", department: null },
    { email: "auditor@exemplo.mz", name: "Auditor Sintético", role: "AUDITOR", department: null },
    { email: "executivo@exemplo.mz", name: "Executivo Sintético", role: "EXECUTIVE", department: null },
    { email: "chefe.ict@exemplo.mz", name: "Chefe ICT Sintético", role: "DEPARTMENT_HEAD", department: "ICT" },
    { email: "tutor.ict@exemplo.mz", name: "Tutor ICT Sintético", role: "TUTOR", department: "ICT" },
  ] as const;

  for (const spec of devUsers) {
    const existing = await prisma.user.findUnique({ where: { email: spec.email } });
    let userId = existing?.id;
    if (!userId) {
      const created = await auth.api.signUpEmail({
        body: { name: spec.name, email: spec.email, password, userType: "STAFF" },
      });
      userId = created?.user?.id;
      if (!userId) throw new Error(`Utilizador sintético não criado: ${spec.email}`);
      // Contas de desenvolvimento: e-mail verificado para poder entrar sem N-01.
      await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    }

    const hasRole = await prisma.roleAssignment.findFirst({
      where: { userId, role: spec.role, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
    });
    if (!hasRole) {
      const department = spec.department
        ? await prisma.department.findUnique({ where: { code: spec.department } })
        : null;
      if (spec.department && !department) throw new Error(`Departamento inexistente: ${spec.department}`);
      await prisma.roleAssignment.create({
        data: {
          userId,
          role: spec.role,
          departmentId: department?.id ?? null,
          validFrom: new Date(),
          reason: "seed de desenvolvimento (R-01)",
          grantedById: userId,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaMssql(parseSqlserverUrl(process.env.DATABASE_URL as string, 5)),
  });
  try {
    await seedCatalogs(prisma);
    await seedDevUsers(prisma);
    const counts = {
      locais: await prisma.location.count(),
      departamentos: await prisma.department.count(),
      instituicoes: await prisma.institution.count(),
      cursos: await prisma.course.count(),
      disciplinas: await prisma.keySubject.count(),
      competencias: await prisma.skill.count(),
      feriados: await prisma.holiday.count(),
      checklist: await prisma.checklistTemplateItem.count(),
      parametros: await prisma.setting.count(),
      utilizadores: await prisma.user.count(),
      papeis: await prisma.roleAssignment.count(),
    };
    console.log("Seeds aplicados:", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });