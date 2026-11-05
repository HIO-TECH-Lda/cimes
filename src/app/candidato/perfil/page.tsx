import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PerfilForms } from "@/components/perfil-forms";
import { pt } from "@/i18n/pt-MZ";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { systemClock } from "@/server/infra/clock";
import { createProfileService } from "@/server/services/candidate-profile";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Assistente do perfil por passos (RF-CAN-01 a 03): validação partilhada
 * cliente/servidor (RF-CAN-02), gravação de cada passo à medida que é
 * concluído, BI decifrado só para o próprio preencher. Utilizável a 360 px.
 */
export default async function PerfilPage() {
  const authenticated = await getSessionPrincipal(await headers());
  if (!authenticated) redirect("/entrar");
  if (!canAct(authenticated.principal, "own.profileManage")) {
    redirect(authenticated.principal.userType === "STAFF" ? "/app" : "/entrar");
  }

  const service = createProfileService({ prisma: getPrismaClient(), clock: systemClock });
  const [leitura, catalogo] = await Promise.all([
    service.getOwn(authenticated.principal),
    service.listFormCatalog(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{pt.perfil.titulo}</h1>
      <PerfilForms
        email={authenticated.user.email}
        passosIniciais={leitura.passos}
        perfil={leitura.perfil}
        biNumber={leitura.biNumber}
        nuit={leitura.nuit}
        skillIds={leitura.skillIds}
        catalogo={catalogo}
      />
    </div>
  );
}