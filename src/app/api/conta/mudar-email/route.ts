import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuth } from "@/server/auth/better-auth";

/**
 * Mudança de e-mail (RF-AUT-08): exige a senha actual, verificada no servidor
 * (Better Auth /verify-password, scope "server") antes do pedido. A mudança
 * só se aplica depois de confirmação enviada ao endereço antigo (N-01 com
 * requestType "change-email-confirmation" do Better Auth).
 */
const pedidoSchema = z.object({
  novoEmail: z.email().max(254),
  senhaActual: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const parsed = pedidoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const auth = getAuth();
  const sessao = await auth.api.getSession({ headers: request.headers });
  if (!sessao) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    // RF-AUT-08: senha actual obrigatória (lança erro se estiver errada).
    await auth.api.verifyPassword({
      body: { password: parsed.data.senhaActual },
      headers: request.headers,
    });
  } catch {
    return NextResponse.json({ ok: false, motivo: "SENHA_INVALIDA" }, { status: 403 });
  }

  try {
    await auth.api.changeEmail({
      body: { newEmail: parsed.data.novoEmail, callbackURL: "/conta" },
      headers: request.headers,
    });
  } catch {
    return NextResponse.json({ ok: false, motivo: "PEDIDO_INVALIDO" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}