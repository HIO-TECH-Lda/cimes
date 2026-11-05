import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { pt } from "@/i18n/pt-MZ";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { PROFILE_STEPS } from "@/server/domain/candidate-profile";
import { systemClock } from "@/server/infra/clock";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createProfileService } from "@/server/services/candidate-profile";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Portal do candidato (RF-CAN-01): estado do perfil com indicador de
 * progresso e entrada para o assistente. Candidaturas e documentos chegam nos
 * incrementos seguintes do M2; aqui não há funcionalidade falsa.
 */
export default async function CandidatoPage() {
  const authenticated = await getSessionPrincipal(await headers());
  if (!authenticated) redirect("/entrar");
  if (!canAct(authenticated.principal, "own.profileManage")) {
    redirect(authenticated.principal.userType === "STAFF" ? "/app" : "/entrar");
  }

  const service = createProfileService({ prisma: getPrismaClient(), clock: systemClock });
  const { perfil, passos } = await service.getOwn(authenticated.principal);
  const concluidos = new Set(passos);
  const iniciado = perfil !== null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{pt.nav.candidato}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{authenticated.user.email}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{pt.perfil.titulo}</CardTitle>
          <CardDescription>{pt.perfil.descricao}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2">
            {PROFILE_STEPS.map((passo, i) => {
              const done = concluidos.has(passo);
              return (
                <li key={passo} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      done ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={done ? "" : "text-muted-foreground"}>{pt.perfil.passos[passo]}</span>
                </li>
              );
            })}
          </ol>
          <Link
            href="/candidato/perfil"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {iniciado ? pt.perfil.continuar : pt.perfil.comecar}
          </Link>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{pt.perfil.candidaturasTitulo}</CardTitle>
            <CardDescription>{pt.perfil.emBreve}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{pt.perfil.documentosTitulo}</CardTitle>
            <CardDescription>{pt.perfil.emBreve}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}