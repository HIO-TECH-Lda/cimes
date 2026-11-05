import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { EntrarForms } from "@/components/entrar-forms";
import { getConfig } from "@/server/infra/config";

/**
 * Contas sintéticas de demonstração (R-01) — só renderizam com DEMO_MODE=1
 * fora de produção (a configuração recusa DEMO_MODE em produção, RNF-05).
 */
const DEMO_CONTAS = [
  { email: "admin@exemplo.mz", senha: "Cimes!Dev2026", papel: "SYSTEM_ADMIN" },
  { email: "rh.gestor@exemplo.mz", senha: "Cimes!Dev2026", papel: "HR_MANAGER" },
  { email: "rh.oficial@exemplo.mz", senha: "Cimes!Dev2026", papel: "HR_OFFICER" },
  { email: "auditor@exemplo.mz", senha: "Cimes!Dev2026", papel: "AUDITOR" },
  { email: "executivo@exemplo.mz", senha: "Cimes!Dev2026", papel: "EXECUTIVE" },
  { email: "chefe.ict@exemplo.mz", senha: "Cimes!Dev2026", papel: "DEPARTMENT_HEAD" },
  { email: "tutor.ict@exemplo.mz", senha: "Cimes!Dev2026", papel: "TUTOR" },
] as const;

/** Entrada (M01): colaboradores por Entra ID ou local (RF-AUT-01/02); candidatos por e-mail e senha (RF-AUT-03). */
export default function EntrarPage() {
  const cfg = getConfig();
  const entraEnabled =
    cfg.staffAuthMode === "entra" &&
    Boolean(cfg.microsoftClientId) &&
    Boolean(cfg.microsoftClientSecret) &&
    Boolean(cfg.microsoftTenantId);
  const localStaffEnabled = cfg.staffAuthMode === "local";

  return (
    <div className="space-y-4">
      <EntrarForms
        entraEnabled={entraEnabled}
        localStaffEnabled={localStaffEnabled}
        demoContas={cfg.demoMode && localStaffEnabled ? DEMO_CONTAS : undefined}
      />
      <p className="text-muted-foreground text-center text-sm">
        {pt.auth.semConta}{" "}
        <Link href="/registar" className="underline">
          {pt.auth.registar}
        </Link>
      </p>
    </div>
  );
}