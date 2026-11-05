import { execSync } from "node:child_process";

/**
 * Preparação do ambiente E2E: as jornadas M1 dependem da base de
 * desenvolvimento com seeds aplicados. O desbloqueio das contas sintéticas
 * limpa bloqueios progressivos de execuções anteriores (RF-AUT-07) — nunca
 * correr contra uma base de produção (usa a DATABASE_URL de desenvolvimento).
 */
export default function globalSetup(): void {
  execSync("npx tsx prisma/seed/desbloquear-dev.ts", { stdio: "inherit" });
}