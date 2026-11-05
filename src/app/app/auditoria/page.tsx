import Link from "next/link";
import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { createAuditService } from "@/server/services/audit";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Registo de auditoria (RF-AUD-01 a 04, RF-ADM-09): listagem com filtros e
 * exportação CSV. A visibilidade por papel (técnico/negocio/tudo) é aplicada
 * no serviço, nunca na página.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ accao?: string; entidade?: string; id?: string; de?: string; ate?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "audit.view")) {
    return <AcessoNegado />;
  }

  const audit = createAuditService(getPrismaClient());
  const page = Math.max(1, Number(params.pagina ?? "1") || 1);
  const result = await audit.list(authenticated.principal, {
    actions: params.accao ? [params.accao as never] : undefined,
    entityType: params.entidade || undefined,
    entityId: params.id || undefined,
    from: params.de ? new Date(params.de) : undefined,
    to: params.ate ? new Date(`${params.ate}T23:59:59`) : undefined,
    page,
    pageSize: 50,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / 50));

  const query = new URLSearchParams({
    ...(params.accao ? { accao: params.accao } : {}),
    ...(params.entidade ? { entidade: params.entidade } : {}),
    ...(params.id ? { id: params.id } : {}),
    ...(params.de ? { de: params.de } : {}),
    ...(params.ate ? { ate: params.ate } : {}),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{pt.audit.titulo}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/app/auditoria/csv?${query.toString()}`}>{pt.audit.exportar}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{pt.audit.filtrar}</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="accao">{pt.audit.accao}</Label>
              <Input id="accao" name="accao" defaultValue={params.accao ?? ""} placeholder="LOGIN_FAILED" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entidade">{pt.audit.entidade}</Label>
              <Input id="entidade" name="entidade" defaultValue={params.entidade ?? ""} placeholder="Setting" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="id">ID</Label>
              <Input id="id" name="id" defaultValue={params.id ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={params.de ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={params.ate ?? ""} />
            </div>
            <Button type="submit" size="sm" className="sm:col-span-5 w-fit">
              {pt.audit.filtrar}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        {result.total} {pt.audit.total}
      </p>

      {result.rows.length === 0 ? (
        <Alert>
          <AlertDescription>{pt.audit.vazia}</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">{pt.audit.instantes}</th>
                <th className="py-2 pr-4 font-medium">{pt.audit.actor}</th>
                <th className="py-2 pr-4 font-medium">{pt.audit.accao}</th>
                <th className="py-2 pr-4 font-medium">{pt.audit.entidade}</th>
                <th className="py-2 pr-4 font-medium">{pt.audit.resumo}</th>
                <th className="py-2 pr-4 font-medium">{pt.audit.ip}</th>
                <th className="py-2 font-medium">{pt.audit.correlacao}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-2 pr-4 font-mono text-xs">{row.occurredAt.toISOString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.actorUserId ?? "—"}</td>
                  <td className="py-2 pr-4">{row.action}</td>
                  <td className="py-2 pr-4 text-xs">
                    {row.entityType}
                    {row.entityId ? `/${row.entityId}` : ""}
                  </td>
                  <td className="py-2 pr-4 text-xs">{row.summary ?? "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.ipAddress ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{row.correlationId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/auditoria?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(page - 1) }).toString()}`}>
                ←
              </Link>
            </Button>
          ) : null}
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/auditoria?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(page + 1) }).toString()}`}>
                →
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}