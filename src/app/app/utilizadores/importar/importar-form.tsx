"use client";

import { useActionState, useState } from "react";

import { pt } from "@/i18n/pt-MZ";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  importarDirectorioAction,
  type ImportarEstado,
} from "./actions";

const ESTADO_INICIAL: ImportarEstado = {};

const ESTADO_ROTULO: Record<string, string> = {
  criado: pt.directorio.estadoCriado,
  actualizado: pt.directorio.estadoActualizado,
  erro: pt.directorio.estadoErro,
};

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * RF-ADM-12/RN-ADM-03: formulário de importação do directório com modo de
 * simulação e relatório por linha. O ficheiro é lido para o estado no
 * cliente (React 19 repõe o formulário após cada acção, o que limparia um
 * input de ficheiro não controlado e impediria o segundo passo).
 */
export function ImportarDirectorioForm() {
  const [estado, accao, aEnviar] = useActionState(importarDirectorioAction, ESTADO_INICIAL);
  const [csvTexto, setCsvTexto] = useState<string | null>(null);
  const [nomeFicheiro, setNomeFicheiro] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const relatorio = estado.relatorio;

  async function escolherFicheiro(files: FileList | null) {
    setErroLocal(null);
    setEstadoLimpo();
    const ficheiro = files?.[0];
    if (!ficheiro) return;
    if (ficheiro.size > MAX_BYTES) {
      setErroLocal(pt.directorio.erroTamanho);
      return;
    }
    setNomeFicheiro(ficheiro.name);
    setCsvTexto(await ficheiro.text());
  }

  function setEstadoLimpo(): void {
    setNomeFicheiro(null);
    setCsvTexto(null);
  }

  return (
    <div className="space-y-4">
      <form action={accao} className="space-y-4">
        <input type="hidden" name="ficheiroTexto" value={csvTexto ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="ficheiro">{pt.directorio.escolherFicheiro}</Label>
          <Input
            id="ficheiro"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void escolherFicheiro(e.target.files)}
            disabled={aEnviar}
          />
          {nomeFicheiro ? <p className="text-muted-foreground text-xs">{nomeFicheiro}</p> : null}
        </div>
        {erroLocal ? (
          <Alert variant="destructive">
            <AlertDescription>{erroLocal}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="submit"
            name="modo"
            value="simular"
            variant="outline"
            disabled={aEnviar || !csvTexto}
          >
            {pt.directorio.simular}
          </Button>
          <Button type="submit" name="modo" value="importar" disabled={aEnviar || !csvTexto}>
            {pt.directorio.importar}
          </Button>
        </div>
      </form>

      {estado.erro ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      ) : null}
      {estado.ok ? (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      ) : null}

      {relatorio ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {pt.directorio.resumo}: {relatorio.criados} {pt.directorio.criados.toLowerCase()} ·{" "}
            {relatorio.actualizados} {pt.directorio.actualizados.toLowerCase()} ·{" "}
            {relatorio.erros} {pt.directorio.erros.toLowerCase()}
          </p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">{pt.directorio.colLinha}</th>
                  <th className="px-3 py-2 text-left">{pt.directorio.colEstado}</th>
                  <th className="px-3 py-2 text-left">{pt.directorio.colMensagem}</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.linhas.map((linha) => (
                  <tr key={linha.linha} className="border-t">
                    <td className="px-3 py-1.5">{linha.linha}</td>
                    <td className={`px-3 py-1.5 ${linha.estado === "erro" ? "text-destructive" : ""}`}>
                      {ESTADO_ROTULO[linha.estado] ?? linha.estado}
                    </td>
                    <td className="px-3 py-1.5">{linha.mensagem ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}