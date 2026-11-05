"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { pt } from "@/i18n/pt-MZ";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Passo "Documentos" do perfil (RF-CAN-01) e RF-DOC-01/02: lista por tipo com
 * estado, carregamento de ficheiro (multipart) e substituição após rejeição.
 * Obrigatórios conforme o estatuto académico; "Outros" até 5 (RF-DOC-01).
 */

export type DocumentoVista = {
  id: string;
  type: string;
  status: string;
  rejectionReason: string | null;
  fileId: string;
  file: { originalName: string; sizeBytes: number; pageCount: number | null };
};

const OBRIGATORIOS_FINALISTA = ["BI", "CV", "TRANSCRIPT"] as const;
const OBRIGATORIOS_GRADUADO = ["BI", "CV", "TRANSCRIPT", "CERTIFICATE"] as const;
const OPCIONAIS = ["ENROLMENT_PROOF"] as const;

function tipoLabel(tipo: string): string {
  return pt.documentos.tipos[tipo as keyof typeof pt.documentos.tipos] ?? tipo;
}

function estadoLabel(estado: string): string {
  return pt.documentos.estados[estado as keyof typeof pt.documentos.estados] ?? estado;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DocumentosForms({
  documentos,
  academicStatus,
}: {
  documentos: DocumentoVista[];
  academicStatus: string | null;
}) {
  const router = useRouter();
  const [aCarregar, setACarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const entradas = useRef<Record<string, HTMLInputElement | null>>({});

  const obrigatorios = academicStatus === "GRADUATE" ? OBRIGATORIOS_GRADUADO : academicStatus === "FINALIST" ? OBRIGATORIOS_FINALISTA : null;
  const tipos = obrigatorios
    ? [...obrigatorios, ...(academicStatus === "FINALIST" ? OPCIONAIS : []), "OTHER"]
    : null;
  const outros = documentos.filter((d) => d.type === "OTHER");

  async function carregar(chave: string, tipo: string, ficheiro: File) {
    setACarregar(tipo);
    setErro(null);
    setOk(null);
    try {
      const corpo = new FormData();
      corpo.set("ficheiro", ficheiro);
      corpo.set("tipo", tipo);
      const resposta = await fetch("/api/candidato/documentos", { method: "POST", body: corpo });
      const dados = (await resposta.json().catch(() => null)) as { ok?: boolean; mensagem?: string; motivo?: string } | null;
      if (resposta.ok && dados?.ok) {
        setOk(pt.documentos.carregado);
        router.refresh();
        return;
      }
      setErro(dados?.mensagem ?? pt.documentos.erroCarregamento);
    } catch {
      setErro(pt.documentos.erroCarregamento);
    } finally {
      setACarregar(null);
      if (entradas.current[chave]) entradas.current[chave]!.value = "";
    }
  }

  function linhaDocumento(chave: string, tipo: string, doc: DocumentoVista | undefined, obrigatorio: boolean) {
    return (
      <div key={chave} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-medium">
            {tipoLabel(tipo)}
            {obrigatorio && <span className="text-destructive"> *</span>}
          </p>
          {doc ? (
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={doc.status === "VALIDATED" ? "default" : doc.status === "REJECTED" ? "destructive" : "secondary"}>
                {estadoLabel(doc.status)}
              </Badge>
              {doc.file.originalName} · {fmtBytes(doc.file.sizeBytes)}
              {doc.file.pageCount ? ` · ${doc.file.pageCount} págs` : ""}
              <a href={`/api/ficheiros/${doc.fileId}`} target="_blank" rel="noreferrer" className="underline">
                {pt.documentos.abrir}
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              {obrigatorio ? pt.documentos.emFalta : pt.documentos.opcional}
            </p>
          )}
          {doc?.status === "REJECTED" && doc.rejectionReason && (
            <p className="mt-1 text-sm text-destructive">
              {pt.documentos.motivoRejeicao}: {doc.rejectionReason}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`ficheiro-${chave}`} className="sr-only">
            {tipoLabel(tipo)}
          </Label>
          <Input
            id={`ficheiro-${chave}`}
            ref={(el) => {
              entradas.current[chave] = el;
            }}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={aCarregar !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void carregar(chave, tipo, f);
            }}
            className="w-full sm:w-72"
          />
          {doc && doc.status !== "VALIDATED" && (
            <p className="text-muted-foreground mt-1 text-xs">{pt.documentos.substitui}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {ok && (
        <Alert>
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      )}

      {!tipos ? (
        <p className="text-muted-foreground text-sm">{pt.documentos.precisaFormacao}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{pt.documentos.regras}</p>
          {obrigatorios!.map((tipo) => linhaDocumento(tipo, tipo, documentos.find((d) => d.type === tipo), true))}
          {academicStatus === "FINALIST" && linhaDocumento("ENROLMENT_PROOF", "ENROLMENT_PROOF", documentos.find((d) => d.type === "ENROLMENT_PROOF"), false)}
          <div className="mt-2">
            <p className="text-sm font-medium">{tipoLabel("OTHER")}</p>
            <p className="text-muted-foreground text-sm">{pt.documentos.outrosNota}</p>
            {outros.map((d) => linhaDocumento(d.id, "OTHER", d, false))}
            <div className="mt-2">{linhaDocumento("OTHER-novo", "OTHER", undefined, false)}</div>
          </div>
        </>
      )}
    </div>
  );
}