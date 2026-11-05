import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { EntrarForms } from "@/components/entrar-forms";
import { getConfig } from "@/server/infra/config";

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
      <EntrarForms entraEnabled={entraEnabled} localStaffEnabled={localStaffEnabled} />
      <p className="text-muted-foreground text-center text-sm">
        {pt.auth.semConta}{" "}
        <Link href="/registar" className="underline">
          {pt.auth.registar}
        </Link>
      </p>
    </div>
  );
}