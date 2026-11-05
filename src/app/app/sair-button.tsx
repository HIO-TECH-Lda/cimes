"use client";

import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/client";

import { pt } from "@/i18n/pt-MZ";
import { Button } from "@/components/ui/button";

const authClient = createAuthClient();

/** Termina a sessão (RF-AUT-06: LOGOUT auditado pelo hook de sessão? — a sessão é revogada). */
export function SairButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void authClient
          .signOut()
          .then(() => router.push("/entrar"));
      }}
    >
      {pt.auth.sair}
    </Button>
  );
}