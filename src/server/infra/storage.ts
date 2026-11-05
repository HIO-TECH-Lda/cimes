import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getConfig } from "@/server/infra/config";

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