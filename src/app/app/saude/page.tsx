import { headers } from "next/headers";
import { existsSync } from "node:fs";
import { access, constants } from "node:fs/promises";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { getConfig } from "@/server/infra/config";
import { pingDatabase, getPrismaClient } from "@/server/repositories/db";

/**
 * Saúde do sistema (RF-ADM-14, RNF-12): base de dados, armazenamento, e-mail,
 * IA e fila. Sem dados sensíveis; só estado e versão.
 */
export default async function SaudePage() {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "health.view")) {
    return <AcessoNegado />;
  }

  const cfg = getConfig();

  const dbOk = await pingDatabase(getPrismaClient())
    .then(() => true)
    .catch(() => false);

  const storageDir = cfg.fileStoragePath;
  const storageExists = existsSync(storageDir);
  const storageOk = storageExists
    ? await access(storageDir, constants.W_OK)
        .then(() => true)
        .catch(() => false)
    : false;

  const linhas = [
    { nome: pt.saude.baseDados, ok: dbOk, detalhe: "SELECT 1" },
    { nome: pt.saude.armazenamento, ok: storageOk, detalhe: storageDir },
    { nome: pt.saude.email, ok: cfg.mailTransport !== "memory" || !cfg.isProduction, detalhe: cfg.mailTransport },
    { nome: pt.saude.ia, ok: true, detalhe: cfg.aiProvider === "disabled" ? "disabled" : cfg.aiProvider },
    { nome: pt.saude.versao, ok: true, detalhe: process.env.npm_package_version ?? "0.1.0" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.saude.titulo}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">CIMES</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {linhas.map((linha) => (
              <li key={linha.nome} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {linha.nome}
                  <span className="text-muted-foreground ml-2 font-mono text-xs">{linha.detalhe}</span>
                </span>
                <span className={linha.ok ? "text-green-600" : "text-destructive"}>
                  {linha.ok ? pt.saude.ok : pt.saude.falha}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}