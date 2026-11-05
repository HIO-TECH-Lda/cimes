import Link from "next/link";
import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionPrincipal } from "@/server/auth/session";

/**
 * Callback da verificação de e-mail (RF-AUT-03, N-01): o Better Auth valida o
 * token e redireciona para aqui (`/api/auth/verify-email?...&callbackURL=`
 * `/verificar-email`). Com `?error=` o link era inválido/expirado; sem erro,
 * a verificação correu (com sessão automática, RF-AUT-03).
 */
export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));

  if (error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{pt.auth.verificacaoTitulo}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{pt.auth.verificadoErro}</AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href="/entrar">{pt.auth.verificarContinuar}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const destino = authenticated?.principal.roles.some((r) => r.role === "CANDIDATE")
    ? "/candidato"
    : authenticated
      ? "/app"
      : "/entrar";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{pt.auth.verificadoTitulo}</CardTitle>
        <CardDescription>{pt.auth.verificadoDescricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!authenticated ? (
          <p className="text-muted-foreground text-sm">{pt.auth.verificadoEntrar}</p>
        ) : null}
        <Button asChild className="w-full">
          <Link href={destino}>{pt.auth.verificarContinuar}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}