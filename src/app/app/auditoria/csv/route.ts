import { headers } from "next/headers";

import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { createAuditService } from "@/server/services/audit";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Exportação CSV do registo de auditoria (RF-ADM-09): mesmos filtros e mesma
 * visibilidade por papel da página de listagem; exporta no máximo 5 000 linhas.
 */
export async function GET(request: Request) {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "audit.view")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const audit = createAuditService(getPrismaClient());
  const result = await audit.list(authenticated.principal, {
    actions: params.get("accao") ? [params.get("accao") as never] : undefined,
    entityType: params.get("entidade") || undefined,
    entityId: params.get("id") || undefined,
    from: params.get("de") ? new Date(params.get("de") as string) : undefined,
    to: params.get("ate") ? new Date(`${params.get("ate")}T23:59:59`) : undefined,
    page: 1,
    pageSize: 5000,
  });

  const csv = audit.toCsv(result.rows);
  const filename = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}