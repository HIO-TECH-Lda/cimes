import { NextResponse } from "next/server";
import { z } from "zod";

import { validatePassword } from "@/server/auth/password";

/**
 * Validação server-side da política de senhas (RF-AUT-04) antes da
 * reposição (RF-AUT-05): sem e-mail na reposição (o Better Auth valida o
 * token), verificação de comprimento e lista de senhas comuns.
 */
const pedidoSchema = z.object({ senha: z.string().max(256) });

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const parsed = pedidoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ problemas: [{ code: "INVALIDO", message: "Pedido inválido" }] }, { status: 400 });
  }
  const problemas = validatePassword("", parsed.data.senha);
  return NextResponse.json({ problemas });
}