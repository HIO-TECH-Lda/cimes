import { NextResponse } from "next/server";

import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { systemClock } from "@/server/infra/clock";
import { createAuditService } from "@/server/services/audit";
import { createCandidateDocumentService } from "@/server/services/candidate-documents";
import { getSessionPrincipal } from "@/server/auth/session";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Rota autenticada de ficheiros (RF-DOC-06): pré-visualização com
 * `Content-Disposition`, `X-Content-Type-Options: nosniff` e CSP `sandbox`.
 * O dono lê o próprio documento; abrir o BI de outro candidato grava
 * SENSITIVE_DATA_VIEWED (RF-DOC-08).
 */
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const sessao = await getSessionPrincipal(request.headers);
  if (!sessao) {
    return NextResponse.json({ ok: false, motivo: "SEM_SESSAO" }, { status: 401 });
  }

  const service = createCandidateDocumentService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
    clock: systemClock,
  });

  try {
    const ficheiro = await service.readFile(sessao.principal, fileId);
    const nomeSeguro = ficheiro.originalName.replace(/[^\w .()-]/g, "_");
    return new NextResponse(new Uint8Array(ficheiro.data), {
      headers: {
        "content-type": ficheiro.mime,
        "content-length": String(ficheiro.data.length),
        "content-disposition": `inline; filename="${nomeSeguro}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    if (erro instanceof NotFoundError) {
      return NextResponse.json({ ok: false, motivo: "NAO_ENCONTRADO" }, { status: 404 });
    }
    if (erro instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, motivo: "SEM_PERMISSAO" }, { status: 403 });
    }
    throw erro;
  }
}