import Link from "next/link";
import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { ImportarDirectorioForm } from "./importar-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";

/**
 * Directório de colaboradores — importação CSV (RF-ADM-12, RN-ADM-03):
 * simulação sem gravação, relatório por linha e importação idempotente.
 */
export default async function ImportarDirectorioPage() {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "staffDirectory.import")) {
    return <AcessoNegado />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.directorio.titulo}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{pt.directorio.titulo}</CardTitle>
          <CardDescription>{pt.directorio.descricao}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild variant="outline">
            <a href="/app/utilizadores/importar/modelo" download>
              {pt.directorio.descarregarModelo}
            </a>
          </Button>
          <ImportarDirectorioForm />
          <p className="text-sm">
            <Link href="/app/utilizadores" className="underline">
              {pt.directorio.voltar}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}