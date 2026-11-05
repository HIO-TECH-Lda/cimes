import { z } from "zod";

import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import type { PrismaClient } from "@/server/repositories/db";
import { ForbiddenError } from "@/server/domain/errors";
import type { AuditService } from "@/server/services/audit";

/**
 * Directório de colaboradores (RF-ADM-12): importação CSV idempotente por
 * e-mail, com relatório por linha e modo de simulação que não grava nada.
 * RN-ADM-03: UTF-8 (com ou sem BOM), separador `;` ou `,` detectado no
 * cabeçalho, cabeçalhos fixos do Anexo F. Auditoria IMPORT_EXECUTED (técnico,
 * RF-AUD-03/04) — sem e-mails no diff (R-09, campo sensível).
 */

export const DIRECTORY_CSV_HEADERS = [
  "numero_colaborador",
  "nome",
  "email",
  "codigo_departamento",
  "cargo",
] as const;

export const DIRECTORY_CSV_TEMPLATE = `${DIRECTORY_CSV_HEADERS.join(";")}\n1001;Ana Exemplo Sintética;ana.exemplo@exemplo.mz;ICT;Técnica\n`;

/** Máximo de linhas de dados por ficheiro (travão contra ficheiros enormes). */
export const DIRECTORY_MAX_ROWS = 5000;

const linhaSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  departmentCode: z.string().trim().min(1).max(20),
  jobTitle: z.string().trim().max(120).optional(),
});

export type DirectoryRow = {
  linha: number;
  employeeNumber: string;
  fullName: string;
  email: string;
  departmentCode: string;
  jobTitle: string | null;
};

export type DirectoryLineReport = {
  linha: number;
  estado: "criado" | "actualizado" | "erro";
  mensagem?: string;
};

export type DirectoryReport = {
  linhas: DirectoryLineReport[];
  criados: number;
  actualizados: number;
  erros: number;
};

export type DirectoryParseResult = {
  rows: DirectoryRow[];
  erros: DirectoryLineReport[];
  separador: string;
};

/** Detecção de separador (RN-ADM-03): o mais frequente na primeira linha. */
function detectarSeparador(cabecalho: string): string {
  const pontos = (cabecalho.match(/;/g) ?? []).length;
  const virgulas = (cabecalho.match(/,/g) ?? []).length;
  if (pontos === 0 && virgulas === 0) return ";";
  return virgulas > pontos ? "," : ";";
}

/**
 * Analisa o CSV do directório (função pura, RN-ADM-03). Sem gravação — a
 * validação contra a base de dados (departamento, conflitos) corre no serviço.
 */
export function parseDirectoryCsv(text: string): DirectoryParseResult {
  const semBom = text.replace(/^\uFEFF/, "");
  const linhas = semBom.split(/\r?\n/);
  const primeira = linhas.findIndex((l) => l.trim().length > 0);
  if (primeira === -1) {
    throw new ForbiddenError("Ficheiro vazio: falta a linha de cabeçalhos");
  }
  const separador = detectarSeparador(linhas[primeira] as string);
  const cabecalho = (linhas[primeira] as string)
    .split(separador)
    .map((c) => c.trim().toLowerCase());
  const esperado = [...DIRECTORY_CSV_HEADERS];
  if (
    cabecalho.length !== esperado.length ||
    cabecalho.some((c, i) => c !== esperado[i])
  ) {
    throw new ForbiddenError(
      `Cabeçalhos inválidos (RN-ADM-03/Anexo F). Esperados: ${esperado.join(separador)}`,
    );
  }

  const rows: DirectoryRow[] = [];
  const erros: DirectoryLineReport[] = [];
  const emailsVistos = new Set<string>();

  for (let i = primeira + 1; i < linhas.length; i++) {
    const bruta = linhas[i] as string;
    const numero = i + 1;
    if (bruta.trim().length === 0) continue; // linhas vazias no fim são toleradas
    if (rows.length + erros.length >= DIRECTORY_MAX_ROWS) {
      throw new ForbiddenError(`Ficheiro com mais de ${DIRECTORY_MAX_ROWS} linhas de dados`);
    }
    const campos = bruta.split(separador);
    if (campos.length !== DIRECTORY_CSV_HEADERS.length) {
      erros.push({
        linha: numero,
        estado: "erro",
        mensagem: `número de colunas inesperado (${campos.length}; esperado ${DIRECTORY_CSV_HEADERS.length})`,
      });
      continue;
    }
    const email = (campos[2] ?? "").trim().toLowerCase();
    const tentativa = linhaSchema.safeParse({
      employeeNumber: campos[0],
      fullName: campos[1],
      email,
      departmentCode: campos[3],
      jobTitle: (campos[4] ?? "").trim() || undefined,
    });
    if (!tentativa.success) {
      const problema = tentativa.error.issues[0];
      erros.push({
        linha: numero,
        estado: "erro",
        mensagem: `campo inválido (${problema?.path.join(".") ?? "?"})`,
      });
      continue;
    }
    if (emailsVistos.has(email)) {
      erros.push({ linha: numero, estado: "erro", mensagem: "e-mail duplicado no ficheiro" });
      continue;
    }
    emailsVistos.add(email);
    rows.push({
      linha: numero,
      employeeNumber: tentativa.data.employeeNumber,
      fullName: tentativa.data.fullName,
      email: tentativa.data.email,
      departmentCode: tentativa.data.departmentCode,
      jobTitle: tentativa.data.jobTitle ?? null,
    });
  }

  return { rows, erros, separador };
}

export type StaffDirectoryService = ReturnType<typeof createStaffDirectoryService>;

export function createStaffDirectoryService(
  deps: { prisma: PrismaClient; audit: AuditService },
) {
  const prisma = deps.prisma;

  function assertImport(principal: Principal): void {
    assertCan(principal, "staffDirectory.import");
  }

  type Plano = {
    linha: number;
    row: DirectoryRow;
    departmentId: string;
    userId: string | null;
    existente: { id: string; employeeNumber: string; userId: string | null } | null;
    estado: "criado" | "actualizado";
  };

  /**
   * Valida as linhas contra a base de dados (sem gravar): departamento
   * existente e activo, e-mail idempotente, número de colaborador sem conflito.
   */
  async function planear(
    principal: Principal,
    csvText: string,
  ): Promise<{ plano: Plano[]; relatorio: DirectoryReport }> {
    assertImport(principal);
    const { rows, erros } = parseDirectoryCsv(csvText);

    const codes = [...new Set(rows.map((r) => r.departmentCode))];
    const emails = [...new Set(rows.map((r) => r.email))];
    const numbers = [...new Set(rows.map((r) => r.employeeNumber))];

    const [departamentos, perfisPorEmail, perfisPorNumero, utilizadores] = await Promise.all([
      prisma.department.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, active: true } }),
      prisma.staffProfile.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, employeeNumber: true, userId: true },
      }),
      prisma.staffProfile.findMany({
        where: { employeeNumber: { in: numbers } },
        select: { id: true, email: true, employeeNumber: true },
      }),
      prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }),
    ]);

    const porCode = new Map(departamentos.filter((d) => d.active).map((d) => [d.code, d]));
    const perfilPorEmail = new Map(perfisPorEmail.map((p) => [p.email, p]));
    const numeroDono = new Map(perfisPorNumero.map((p) => [p.employeeNumber, p.email]));
    const userPorEmail = new Map(utilizadores.map((u) => [u.email, u.id]));

    const plano: Plano[] = [];
    const relatorio: DirectoryReport = { linhas: [], criados: 0, actualizados: 0, erros: erros.length };
    relatorio.linhas.push(...erros);

    for (const row of rows) {
      const departamento = porCode.get(row.departmentCode);
      if (!departamento) {
        relatorio.linhas.push({ linha: row.linha, estado: "erro", mensagem: "departamento inexistente ou inactivo" });
        relatorio.erros++;
        continue;
      }
      const donoNumero = numeroDono.get(row.employeeNumber);
      if (donoNumero && donoNumero !== row.email) {
        relatorio.linhas.push({
          linha: row.linha,
          estado: "erro",
          mensagem: "número de colaborador já usado por outro e-mail",
        });
        relatorio.erros++;
        continue;
      }
      const existente = perfilPorEmail.get(row.email) ?? null;
      plano.push({
        linha: row.linha,
        row,
        departmentId: departamento.id,
        userId: userPorEmail.get(row.email) ?? null,
        existente,
        estado: existente ? "actualizado" : "criado",
      });
      relatorio.linhas.push({ linha: row.linha, estado: existente ? "actualizado" : "criado" });
      if (existente) relatorio.actualizados++;
      else relatorio.criados++;
    }

    return { plano, relatorio };
  }

  return {
    /** RN-ADM-03: modo de simulação — valida e reporta sem gravar nada. */
    async simulate(principal: Principal, csvText: string): Promise<DirectoryReport> {
      const { relatorio } = await planear(principal, csvText);
      return relatorio;
    },

    /** RF-ADM-12: importa (idempotente por e-mail) e audita IMPORT_EXECUTED. */
    async import(principal: Principal, csvText: string): Promise<DirectoryReport> {
      const { plano, relatorio } = await planear(principal, csvText);

      await prisma.$transaction(async (tx) => {
        for (const item of plano) {
          const dados = {
            employeeNumber: item.row.employeeNumber,
            fullName: item.row.fullName,
            departmentId: item.departmentId,
            jobTitle: item.row.jobTitle,
          };
          // Ligação ao utilizador pelo e-mail (RF-AUT-01): só se a conta
          // existir — nunca se desfaz uma ligação já existente.
          const update = item.userId ? { ...dados, userId: item.userId } : dados;
          await tx.staffProfile.upsert({
            where: { email: item.row.email },
            create: { ...update, email: item.row.email, active: true },
            update,
          });
        }
      });

      await deps.audit.record({
        actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
        action: "IMPORT_EXECUTED",
        entityType: "staffDirectory",
        entityId: "colaboradores.csv",
        summary: `directório importado: ${relatorio.criados} criados, ${relatorio.actualizados} actualizados, ${relatorio.erros} erros`,
        diff: null,
      });

      return relatorio;
    },
  };
}