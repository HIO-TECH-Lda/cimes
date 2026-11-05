import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getConfig } from "@/server/infra/config";
import { rewrapEnvelope } from "@/server/infra/file-crypto";

/**
 * Rotação da chave mestra dos ficheiros (G.6): volta a cifrar as DEK de todos
 * os ficheiros guardados com a nova `FILE_ENCRYPTION_ACTIVE_KEY_ID`, sem tocar
 * no conteúdo. A chave antiga tem de continuar no anel.
 */

const cfg = getConfig();
const raiz = cfg.fileStoragePath;

let Visitados = 0;
let Reenvolvidos = 0;
let Ignorados = 0;

function percorrer(dir: string): void {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const estado = statSync(caminho);
    if (estado.isDirectory()) {
      percorrer(caminho);
    } else if (estado.isFile()) {
      const dados = readFileSync(caminho);
      if (dados.subarray(0, 6).toString("ascii") !== "CIMES1") {
        continue; // probes e afins
      }
      Visitados += 1;
      try {
        const novo = rewrapEnvelope(dados);
        if (!novo.equals(dados)) {
          writeFileSync(caminho, novo);
          Reenvolvidos += 1;
        } else {
          Ignorados += 1;
        }
      } catch (erro) {
        console.error(`falha em ${caminho}:`, erro instanceof Error ? erro.message : erro);
        process.exitCode = 1;
      }
    }
  }
}

percorrer(raiz);
console.log(`ficheiros visitados: ${Visitados}; re-envolvidos: ${Reenvolvidos}; já na chave activa: ${Ignorados}`);