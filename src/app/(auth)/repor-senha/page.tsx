import { Suspense } from "react";
import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { ReporSenhaForms } from "@/components/repor-senha-forms";

/**
 * Recuperação de senha (RF-AUT-05): sem token é o pedido (N-02); com token
 * é a redefinição. O formulário é cliente (Better Auth) e o token vem do
 * link do e-mail.
 */
export default function ReporSenhaPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <h1 className="text-2xl font-semibold">{pt.reporSenha.titulo}</h1>
      <Suspense>
        <ReporSenhaForms />
      </Suspense>
      <p className="text-muted-foreground text-sm">
        <Link href="/entrar" className="underline">
          {pt.nav.entrar}
        </Link>
      </p>
    </div>
  );
}