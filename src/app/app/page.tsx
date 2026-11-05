import { headers } from "next/headers";
import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionPrincipal } from "@/server/auth/session";

/**
 * Home do back-office: mostra a identidade e os papéis válidos (G.5 Principal).
 * Sem sessão → 403; com sessão, a navegação mostra as áreas de cada papel.
 */
export default async function AppHomePage() {
  const principalSession = await getSessionPrincipal(new Headers(await headers()));
  if (!principalSession) return <AcessoNegado />;

  const roles = [...new Set(principalSession.principal.roles.map((r) => r.role))];
  const areas: Array<{ href: string; label: string }> = [
    { href: "/app/utilizadores", label: pt.app.utilizadores },
    { href: "/app/parametros", label: pt.app.parametros },
    { href: "/app/catalogos", label: pt.app.catalogos },
    { href: "/app/feriados", label: pt.feriados.titulo },
    { href: "/app/auditoria", label: pt.app.auditoria },
    { href: "/app/saude", label: pt.app.saude },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.nav.app}</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{principalSession.user.name}</CardTitle>
          <CardDescription>{principalSession.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            {roles.length > 0 ? roles.join(", ") : pt.auth.pendenteDescricao}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {areas.map((area) => (
              <li key={area.href}>
                <Link href={area.href} className="underline">
                  {area.label}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}