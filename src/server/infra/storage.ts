import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getConfig } from "@/server/infra/config";
import { decryptFileToBuffer, encryptFileToBuffer, novoStorageKey } from "@/server/infra/file-crypto";

/**
 * G.6: armazenamento local cifrado fora de qualquer pasta servida, com subpastas
 * aaaa/mm/. A implementação completa chega no M2; aqui garantimos apenas que a
 * pasta existe e é gravável (verificação de saúde).
 */
export function ensureStorageReady(storagePath = getConfig().fileStoragePath): void {
  mkdirSync(join(storagePath, "tmp"), { recursive: true });
}

/** Prova de escrita e limpeza (usada por /api/health/ready). */
export function storageWriteProbe(storagePath = getConfig().fileStoragePath): void {
  const dir = join(storagePath, "tmp");
  mkdirSync(dir, { recursive: true });
  const probe = join(dir, `probe-${Date.now()}`);
  writeFileSync(probe, "cimes");
  unlinkSync(probe);
}

/** Guarda um ficheiro cifrado (envelope CIMES1) e devolve os metadados para a BD. */
export function saveEncryptedFile(input: {
  data: Buffer;
  originalName: string;
  mimeType: string;
  purpose: string;
  uploadedById?: string | null;
  pageCount?: number | null;
  agora?: Date;
}): { storageKey: string; sha256: string; sizeBytes: number; pageCount: number | null; keyId: string } {
  ensureStorageReady();
  const agora = input.agora ?? new Date();
  const envelope = encryptFileToBuffer(input.data);
  const storageKey = novoStorageKey(agora);
  const caminho = join(getConfig().fileStoragePath, storageKey);
  mkdirSync(join(caminho, ".."), { recursive: true });
  writeFileSync(caminho, envelope);
  return {
    storageKey,
    sha256: createHash("sha256").update(input.data).digest("hex"),
    sizeBytes: input.data.length,
    pageCount: input.pageCount ?? null,
    keyId: getConfig().fileEncryptionActiveKeyId,
  };
}

/** Lê e abre um ficheiro cifrado; falha se o envelope estiver adulterado. */
export function readEncryptedFile(storageKey: string): Buffer {
  return decryptFileToBuffer(readFileSync(join(getConfig().fileStoragePath, storageKey)));
}

/** Remove o ficheiro do disco (o registo na BD fica com deletedAt). */
export function deleteEncryptedFile(storageKey: string): void {
  unlinkSync(join(getConfig().fileStoragePath, storageKey));
}