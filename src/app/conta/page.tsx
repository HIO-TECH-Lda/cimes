import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { pt } from "@/i18n/pt-MZ";
import { ContaForms } from "@/components/conta-forms";
import { getSessionPrincipal } from "@/server/auth/session";

/**
 * "A minha conta" (RF-AUT-06, RF-AUT-10): dados, senha, sessões activas.
 * Comum a colaboradores e candidatos — a autorização é do próprio titular.
 * "Os meus dados" (RF-PDP-04) e o pedido de eliminação (RF-PDP-05) entram
 * com o módulo de protecção de dados.
 */
export default async function ContaPage() {
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated) redirect("/entrar");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.conta.titulo}</h1>
      <p className="text-muted-foreground text-sm">{pt.conta.descricao}</p>
      <ContaForms
        utilizador={{
          nome: authenticated.user.name,
          email: authenticated.user.email,
          tokenSessao: authenticated.session.token,
        }}
      />
      <p className="text-sm">
        <Link href="/app" className="underline">
          {pt.nav.app}
        </Link>
      </p>
    </div>
  );
}