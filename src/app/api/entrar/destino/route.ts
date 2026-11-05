import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionPrincipal } from "@/server/auth/session";

/**
 * Destino pós-entrada (RF-AUT-01/03): staff com papéis → back-office; staff
 * sem papéis → "Acesso pendente" (RF-AUT-01); externo → portal do candidato.
 * Decidido no servidor com a sessão real — o cliente não escolhe.
 */
export async function GET() {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated) {
    return NextResponse.json({ destino: "/entrar" }, { headers: { "cache-control": "no-store" } });
  }
  const destino =
    authenticated.principal.userType === "STAFF"
      ? authenticated.principal.roles.length > 0
        ? "/app"
        : "/pendente"
      : "/candidato";
  return NextResponse.json({ destino }, { headers: { "cache-control": "no-store" } });
}