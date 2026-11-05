import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { gravarParametroAction } from "@/app/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { createAuditService } from "@/server/services/audit";
import { createSettingService } from "@/server/services/settings";
import { getPrismaClient } from "@/server/repositories/db";

const MSG: Record<string, string> = {
  gravado: pt.settings.gravado,
  invalido: pt.settings.invalido,
};

/** Parâmetros do sistema (RF-ADM-11): leitura e alteração com contrato Zod e auditoria. */
export default async function ParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "settings.manage")) {
    return <AcessoNegado />;
  }

  const prisma = getPrismaClient();
  const service = createSettingService({ prisma, audit: createAuditService(prisma) });
  const settings = await service.list(authenticated.principal);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.settings.titulo}</h1>
      {params.msg ? (
        <Alert variant={params.msg === "invalido" ? "destructive" : "default"}>
          <AlertDescription>{MSG[params.msg] ?? pt.app.acessoNegado}</AlertDescription>
        </Alert>
      ) : null}

      {settings.map((setting) => (
        <Card key={setting.code}>
          <CardHeader>
            <CardTitle className="font-mono text-sm">{setting.code}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={gravarParametroAction} className="space-y-2">
              <input type="hidden" name="codigo" value={setting.code} />
              <Label htmlFor={`valor-${setting.code}`} className="sr-only">
                {pt.settings.valor}
              </Label>
              <Input
                id={`valor-${setting.code}`}
                name="valor"
                defaultValue={setting.valueJson}
                className="font-mono text-xs"
                spellCheck={false}
              />
              <Button type="submit" size="sm" variant="outline">
                {pt.settings.gravar}
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}