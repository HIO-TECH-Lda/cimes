import Link from "next/link";
import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { criarFeriadoAction, eliminarFeriadoAction } from "@/app/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { createAuditService } from "@/server/services/audit";
import { createHolidayService } from "@/server/services/holidays";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Catálogo técnico de feriados (RF-ADM-07): nacionais e locais, com a regra
 * domingo → segunda seguinte calculada pelo domínio. Gestão por RH-G e ADM
 * (`catalog.technicalManage`, C.3).
 */
export default async function FeriadosPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "catalog.technicalManage")) {
    return <AcessoNegado />;
  }

  const service = createHolidayService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
  });
  const [feriados, locais] = await Promise.all([
    service.list(authenticated.principal),
    service.locations(authenticated.principal),
  ]);

  const MSG: Record<string, string> = {
    criado: pt.feriados.criado,
    eliminado: pt.feriados.eliminado,
    invalido: pt.errors.serverErrorDescription,
  };
  const msg = params.msg ? MSG[params.msg] : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.feriados.titulo}</h1>
      <p className="text-muted-foreground text-sm">{pt.feriados.descricao}</p>
      {msg ? (
        <Alert variant={params.msg === "invalido" ? "destructive" : undefined}>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{pt.feriados.criarTitulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={criarFeriadoAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="data">{pt.feriados.data}</Label>
              <Input id="data" name="data" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">{pt.feriados.nome}</Label>
              <Input id="nome" name="nome" maxLength={120} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ambito">{pt.feriados.ambito}</Label>
              <select
                id="ambito"
                name="ambito"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="NATIONAL">{pt.feriados.nacional}</option>
                <option value="LOCAL">{pt.feriados.local}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="localCodigo">{pt.feriados.localCodigo}</Label>
              <select
                id="localCodigo"
                name="localCodigo"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">—</option>
                {locais.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit">{pt.feriados.criar}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pt.feriados.titulo}</CardTitle>
          <CardDescription>
            {feriados.length} · {pt.feriados.colObservado}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feriados.length === 0 ? (
            <p className="text-muted-foreground text-sm">{pt.feriados.semFeriados}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-2 pr-4">{pt.feriados.colData}</th>
                    <th className="py-2 pr-4">{pt.feriados.colObservado}</th>
                    <th className="py-2 pr-4">{pt.feriados.colNome}</th>
                    <th className="py-2 pr-4">{pt.feriados.colAmbito}</th>
                    <th className="py-2 pr-4">{pt.feriados.colLocal}</th>
                    <th className="py-2">{pt.feriados.acoes}</th>
                  </tr>
                </thead>
                <tbody>
                  {feriados.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="py-1.5 pr-4 font-mono text-xs">
                        {f.holidayDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-xs">
                        {f.observedDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="py-1.5 pr-4">{f.name}</td>
                      <td className="py-1.5 pr-4">
                        {f.scope === "LOCAL" ? pt.feriados.localCurto : pt.feriados.nacionalCurto}
                      </td>
                      <td className="py-1.5 pr-4">{f.location?.code ?? "—"}</td>
                      <td className="py-1.5">
                        <form action={eliminarFeriadoAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <Button type="submit" variant="outline" size="sm">
                            {pt.feriados.eliminar}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm">
        <Link href="/app" className="underline">
          {pt.nav.app}
        </Link>
      </p>
    </div>
  );
}