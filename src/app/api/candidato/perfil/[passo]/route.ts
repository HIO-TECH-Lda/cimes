import { NextResponse } from "next/server";
import { z } from "zod";

import { systemClock } from "@/server/infra/clock";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { createProfileService } from "@/server/services/candidate-profile";
import { getSessionPrincipal } from "@/server/auth/session";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Gravação de um passo do perfil do candidato (RF-CAN-01, RF-CAN-02): o
 * esquema Zod partilhado valida aqui no servidor (autoridade). Sem sessão é
 * 401; BI já noutra conta é 409 com a mensagem de RF-CAN-03, sem revelar a
 * outra conta.
 */

const PASSOS = ["pessoais", "contactos", "formacao", "competencias"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ passo: string }> }) {
  const { passo } = await params;
  if (!PASSOS.includes(passo as (typeof PASSOS)[number])) {
    return NextResponse.json({ ok: false, motivo: "PASSO_DESCONHECIDO" }, { status: 404 });
  }
  const sessao = await getSessionPrincipal(request.headers);
  if (!sessao) {
    return NextResponse.json({ ok: false, motivo: "SEM_SESSAO" }, { status: 401 });
  }
  const corpo = await request.json().catch(() => null);
  if (corpo === null || typeof corpo !== "object") {
    return NextResponse.json({ ok: false, motivo: "CORPO_INVALIDO" }, { status: 400 });
  }

  const service = createProfileService({ prisma: getPrismaClient(), clock: systemClock });
  try {
    const resultado =
      passo === "pessoais"
        ? await service.saveStepPersonal(sessao.principal, corpo)
        : passo === "contactos"
          ? await service.saveStepContacts(sessao.principal, corpo)
          : passo === "formacao"
            ? await service.saveStepEducation(sessao.principal, corpo)
            : await service.saveStepSkills(sessao.principal, corpo);
    return NextResponse.json({ ok: true, passos: resultado.passos, perfil: resultado.perfil });
  } catch (erro) {
    if (erro instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "VALIDACAO",
          issues: erro.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
        },
        { status: 400 },
      );
    }
    if (erro instanceof ConflictError) {
      return NextResponse.json({ ok: false, motivo: "BI_DUPLICADO", mensagem: erro.message }, { status: 409 });
    }
    if (erro instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, motivo: "SEM_PERMISSAO" }, { status: 403 });
    }
    if (erro instanceof NotFoundError) {
      return NextResponse.json({ ok: false, motivo: "NAO_ENCONTRADO", mensagem: erro.message }, { status: 404 });
    }
    throw erro;
  }
}