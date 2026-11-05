import { NextResponse } from "next/server";

import { ConflictError, DocumentValidationError, ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { DOCUMENT_TYPES, type DocumentType } from "@/server/domain/document";
import { systemClock } from "@/server/infra/clock";
import { createAuditService } from "@/server/services/audit";
import { createCandidateDocumentService } from "@/server/services/candidate-documents";
import { getSessionPrincipal } from "@/server/auth/session";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Carregamento de documento do candidato (RF-DOC-01/02): multipart/form-data
 * com `ficheiro` (PDF/JPG/PNG, até 10 MB) e `tipo`. A validação do conteúdo
 * real é feita no servidor (RF-DOC-05); ficheiros guardam-se cifrados (G.6).
 */
export async function POST(request: Request) {
  const sessao = await getSessionPrincipal(request.headers);
  if (!sessao) {
    return NextResponse.json({ ok: false, motivo: "SEM_SESSAO" }, { status: 401 });
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, motivo: "FORMULARIO_INVALIDO" }, { status: 400 });
  }
  const ficheiro = formulario.get("ficheiro");
  const tipo = String(formulario.get("tipo") ?? "");
  if (!(ficheiro instanceof File) || !DOCUMENT_TYPES.includes(tipo as DocumentType)) {
    return NextResponse.json({ ok: false, motivo: "PEDIDO_INVALIDO" }, { status: 400 });
  }

  const service = createCandidateDocumentService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
    clock: systemClock,
  });

  try {
    const documento = await service.upload(sessao.principal, {
      type: tipo as DocumentType,
      originalName: ficheiro.name,
      data: Buffer.from(await ficheiro.arrayBuffer()),
    });
    return NextResponse.json({ ok: true, documento });
  } catch (erro) {
    if (erro instanceof DocumentValidationError) {
      return NextResponse.json({ ok: false, motivo: "DOCUMENTO_INVALIDO", mensagem: erro.message }, { status: 400 });
    }
    if (erro instanceof ConflictError) {
      return NextResponse.json({ ok: false, motivo: "LIMITE_ATINGIDO", mensagem: erro.message }, { status: 409 });
    }
    if (erro instanceof NotFoundError) {
      return NextResponse.json({ ok: false, motivo: "NAO_ENCONTRADO", mensagem: erro.message }, { status: 404 });
    }
    if (erro instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, motivo: "SEM_PERMISSAO" }, { status: 403 });
    }
    throw erro;
  }
}