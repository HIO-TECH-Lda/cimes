import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { pt } from "@/i18n/pt-MZ";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { systemClock } from "@/server/infra/clock";
import { createAuditService } from "@/server/services/audit";
import { createCandidateDocumentService } from "@/server/services/candidate-documents";
import { getPrismaClient } from "@/server/repositories/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rejeitarDocumentoAction, validarDocumentoAction } from "./actions";

/**
 * Validação de documentos (RF-DOC-07): fila dos documentos por validar, com
 * pré-visualização pela rota autenticada (RF-DOC-06), validar ou rejeitar com
 * motivo (N-09 ao candidato). Só RH (`application.validate`, C.3).
 */

const MENSAGENS: Record<string, string> = {
  validado: "Documento validado.",
  rejeitado: "Documento rejeitado; o candidato foi avisado (N-09).",
};

const ERROS: Record<string, string> = {
  estado: "O documento mudou de estado entretanto; actualiza a página.",
  motivo: "Indica o motivo da rejeição.",
};

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; erro?: string; todos?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(await headers());
  if (!authenticated) redirect("/entrar");
  if (!canAct(authenticated.principal, "application.validate")) redirect("/app");

  const service = createCandidateDocumentService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
    clock: systemClock,
  });
  const documentos = await service.listForValidation(authenticated.principal, params.todos !== "1");
  const msg = params.msg ? (MENSAGENS[params.msg] ?? null) : null;
  const erro = params.erro ? (ERROS[params.erro] ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{pt.documentos.titulo}</h1>
        <a href={params.todos === "1" ? "/app/documentos" : "/app/documentos?todos=1"} className="text-sm underline">
          {params.todos === "1" ? pt.documentos.verPendentes : pt.documentos.verTodos}
        </a>
      </div>
      {msg && (
        <Alert className="mt-4">
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {documentos.length === 0 ? (
        <p className="text-muted-foreground mt-8">{pt.documentos.semPendentes}</p>
      ) : (
        <div className="mt-6 grid gap-4">
          {documentos.map((doc) => (
            <Card key={doc.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {pt.documentos.tipos[doc.type as keyof typeof pt.documentos.tipos] ?? doc.type}
                  <Badge variant="outline">{doc.candidate.fullName}</Badge>
                  <Badge
                    variant={doc.status === "VALIDATED" ? "default" : doc.status === "REJECTED" ? "destructive" : "secondary"}
                  >
                    {pt.documentos.estados[doc.status as keyof typeof pt.documentos.estados] ?? doc.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {doc.file.originalName} · {fmtBytes(doc.file.sizeBytes)}
                  {doc.file.pageCount ? ` · ${doc.file.pageCount} págs` : ""} · {doc.candidate.user.email}
                </CardDescription>
              </CardHeader>
              {doc.status === "UPLOADED" && (
                <CardContent className="flex flex-wrap items-end gap-3">
                  <a
                    href={`/api/ficheiros/${doc.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline"
                  >
                    {pt.documentos.abrir}
                  </a>
                  <form action={validarDocumentoAction}>
                    <input type="hidden" name="documentoId" value={doc.id} />
                    <Button type="submit" size="sm">
                      {pt.documentos.validar}
                    </Button>
                  </form>
                  <form action={rejeitarDocumentoAction} className="flex items-end gap-2">
                    <input type="hidden" name="documentoId" value={doc.id} />
                    <div>
                      <Label htmlFor={`motivo-${doc.id}`} className="text-xs">
                        {pt.documentos.motivoRejeicao}
                      </Label>
                      <Input id={`motivo-${doc.id}`} name="motivo" className="w-64" maxLength={500} />
                    </div>
                    <Button type="submit" size="sm" variant="outline">
                      {pt.documentos.rejeitar}
                    </Button>
                  </form>
                </CardContent>
              )}
              {doc.status === "REJECTED" && doc.rejectionReason && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {pt.documentos.motivoRegistado}: {doc.rejectionReason}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}