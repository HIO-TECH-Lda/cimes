"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { pt } from "@/i18n/pt-MZ";
import { getSessionPrincipal } from "@/server/auth/session";
import { getPrismaClient } from "@/server/repositories/db";
import { createAuditService } from "@/server/services/audit";
import {
  createStaffDirectoryService,
  type DirectoryReport,
} from "@/server/services/staff-directory";
import { ForbiddenError } from "@/server/domain/errors";

/** Limite do ficheiro do directório (RN-ADM-03 mantém o CSV pequeno). */
/** Limite do ficheiro do directório (RN-ADM-03 mantém o CSV pequeno). */
const MAX_BYTES = 2 * 1024 * 1024;

export type ImportarEstado = {
  ok?: string;
  erro?: string;
  relatorio?: DirectoryReport;
};

/**
 * RF-ADM-12: recebe o conteúdo do CSV (lido no cliente), executa em modo
 * simulação ou importação (o serviço valida permissões) e devolve o
 * relatório por linha.
 */
export async function importarDirectorioAction(
  _anterior: ImportarEstado,
  formData: FormData,
): Promise<ImportarEstado> {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated) return { erro: pt.app.acessoNegado };

  const texto = String(formData.get("ficheiroTexto") ?? "");
  if (texto.trim().length === 0) {
    return { erro: pt.directorio.erroLeitura };
  }
  if (new TextEncoder().encode(texto).length > MAX_BYTES) {
    return { erro: pt.directorio.erroTamanho };
  }

  const modo = formData.get("modo") === "importar" ? "importar" : "simular";
  const service = createStaffDirectoryService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
  });

  try {
    const relatorio =
      modo === "importar"
        ? await service.import(authenticated.principal, texto)
        : await service.simulate(authenticated.principal, texto);
    if (modo === "importar") revalidatePath("/app/utilizadores");
    return { relatorio, ok: modo === "importar" ? pt.directorio.importado : pt.directorio.simulado };
  } catch (error) {
    if (error instanceof ForbiddenError) return { erro: error.message };
    return { erro: pt.errors.serverErrorDescription };
  }
}