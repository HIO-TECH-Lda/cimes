import { headers } from "next/headers";

import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { DIRECTORY_CSV_TEMPLATE } from "@/server/services/staff-directory";

/**
 * Modelo CSV do directório (RF-ADM-12, Anexo F): cabeçalhos fixos e duas
 * linhas de exemplo sintético (R-01).
 */
export async function GET() {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "staffDirectory.import")) {
    return new Response("Acesso negado", { status: 403 });
  }

  return new Response(`\uFEFF${DIRECTORY_CSV_TEMPLATE}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="colaboradores-modelo.csv"',
      "cache-control": "no-store",
    },
  });
}