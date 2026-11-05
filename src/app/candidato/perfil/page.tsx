import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PerfilForms } from "@/components/perfil-forms";
import { pt } from "@/i18n/pt-MZ";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { systemClock } from "@/server/infra/clock";
import { createAuditService } from "@/server/services/audit";
import { createCandidateDocumentService } from "@/server/services/candidate-documents";
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
  const documentosService = createCandidateDocumentService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
    clock: systemClock,
  });
  const [leitura, catalogo, documentos] = await Promise.all([
    service.getOwn(authenticated.principal),
    service.listFormCatalog(),
    documentosService.listOwn(authenticated.principal),
  ]);

  // Passo "documentos" conta quando há um documento validado (RF-CAN-01).
  const passos = documentos.some((d) => d.status === "VALIDATED") && !leitura.passos.includes("documentos")
    ? [...leitura.passos, "documentos" as const]
    : leitura.passos;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{pt.perfil.titulo}</h1>
      <PerfilForms
        email={authenticated.user.email}
        passosIniciais={passos}
        perfil={leitura.perfil}
        biNumber={leitura.biNumber}
        nuit={leitura.nuit}
        skillIds={leitura.skillIds}
        catalogo={catalogo}
        documentos={documentos.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          rejectionReason: d.rejectionReason,
          fileId: d.fileId,
          file: { originalName: d.file.originalName, sizeBytes: d.file.sizeBytes, pageCount: d.file.pageCount },
        }))}
      />
    </div>
  );
}