"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuditService } from "@/server/services/audit";
import { createCandidateDocumentService } from "@/server/services/candidate-documents";
import { getSessionPrincipal } from "@/server/auth/session";
import { systemClock } from "@/server/infra/clock";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Acções de validação de documentos do RH (RF-DOC-07): validar ou rejeitar
 * com motivo. As permissões e o estado são verificados no serviço; falhas
 * voltam à página com mensagem neutra.
 */

async function withSessao(): Promise<NonNullable<Awaited<ReturnType<typeof getSessionPrincipal>>>> {
  const sessao = await getSessionPrincipal(new Headers(await headers()));
  if (!sessao) redirect("/entrar");
  return sessao;
}

function servico() {
  return createCandidateDocumentService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
    clock: systemClock,
  });
}

export async function validarDocumentoAction(formData: FormData): Promise<void> {
  const sessao = await withSessao();
  const documentoId = String(formData.get("documentoId") ?? "");
  try {
    await servico().validate(sessao.principal, documentoId);
  } catch {
    redirect("/app/documentos?erro=estado");
  }
  revalidatePath("/app/documentos");
  redirect("/app/documentos?msg=validado");
}

export async function rejeitarDocumentoAction(formData: FormData): Promise<void> {
  const sessao = await withSessao();
  const documentoId = String(formData.get("documentoId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length === 0) redirect("/app/documentos?erro=motivo");
  try {
    await servico().reject(sessao.principal, documentoId, motivo);
  } catch {
    redirect("/app/documentos?erro=estado");
  }
  revalidatePath("/app/documentos");
  redirect("/app/documentos?msg=rejeitado");
}