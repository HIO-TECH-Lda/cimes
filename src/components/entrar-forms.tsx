"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/client";

import { pt } from "@/i18n/pt-MZ";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Formulários de entrada (M01): colaboradores por Entra ID (RF-AUT-01) e, em
 * modo local, por e-mail e senha (RF-AUT-02); candidatos por e-mail e senha
 * (RF-AUT-03). Falhas alimentam o bloqueio progressivo (RF-AUT-07) via
 * /api/entrar/falha; o estado (captcha/bloqueio) vem de /api/entrar/estado.
 */
const authClient = createAuthClient();

type Mode = "colaborador" | "candidato";

export function EntrarForms({
  entraEnabled,
  localStaffEnabled,
}: {
  entraEnabled: boolean;
  localStaffEnabled: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("colaborador");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [captchaNecessario, setCaptchaNecessario] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);

  useEffect(() => {
    if (!email) return;
    const t = setTimeout(() => {
      void fetch(`/api/entrar/estado?email=${encodeURIComponent(email)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => setCaptchaNecessario(Boolean(s?.captchaRequired)))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEnviar(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        // Resposta neutra (RF-AUT-05): não revela se a conta existe.
        void fetch("/api/entrar/falha", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => undefined);
        setErro(pt.auth.erroCredenciais);
        return;
      }
      // O destino decide-se no servidor (sessão real + papéis válidos).
      const destino = await fetch("/api/entrar/destino")
        .then((r) => (r.ok ? (r.json() as { destino?: string }) : null))
        .then((d) => d?.destino ?? "/");
      router.push(destino);
    } finally {
      setAEnviar(false);
    }
  }

  async function entrarMicrosoft() {
    setAEnviar(true);
    await authClient.signIn.social({ provider: "microsoft", callbackURL: "/app" });
  }

  return (
    <Tabs value={mode} onValueChange={(v: string) => setMode(v as Mode)} className="w-full max-w-md">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="colaborador">{pt.auth.colaborador}</TabsTrigger>
        <TabsTrigger value="candidato">{pt.auth.candidato}</TabsTrigger>
      </TabsList>

      <TabsContent value="colaborador">
        <Card>
          <CardHeader>
            <CardTitle>{pt.auth.colaborador}</CardTitle>
            <CardDescription>{pt.auth.colaboradorDescricao}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {entraEnabled ? (
              <Button type="button" className="w-full" onClick={() => void entrarMicrosoft()} disabled={aEnviar}>
                {pt.auth.entrarMicrosoft}
              </Button>
            ) : null}
            {localStaffEnabled ? (
              <form onSubmit={(e) => void submeter(e)} className="space-y-4">
                <p className="text-muted-foreground text-sm">{pt.auth.candidatoDescricao}</p>
                {erro ? (
                  <Alert variant="destructive">
                    <AlertDescription>{erro}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">{pt.auth.email}</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{pt.auth.senha}</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                {captchaNecessario ? (
                  <Alert>
                    <AlertDescription>{pt.auth.captchaNecessario}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" className="w-full" disabled={aEnviar}>
                  {pt.auth.entrar}
                </Button>
              </form>
            ) : null}
            {!entraEnabled && !localStaffEnabled ? (
              <Alert variant="destructive">
                <AlertDescription>{pt.app.semSessao}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="candidato">
        <Card>
          <CardHeader>
            <CardTitle>{pt.auth.candidato}</CardTitle>
            <CardDescription>{pt.auth.candidatoDescricao}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={(e) => void submeter(e)} className="space-y-4">
              {erro ? (
                <Alert variant="destructive">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email-c">{pt.auth.email}</Label>
                <Input id="email-c" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-c">{pt.auth.senha}</Label>
                <Input id="password-c" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              {captchaNecessario ? (
                <Alert>
                  <AlertDescription>{pt.auth.captchaNecessario}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={aEnviar}>
                {pt.auth.entrar}
              </Button>
            </form>
            <p className="text-muted-foreground text-sm">
              {pt.auth.semConta}{" "}
              <a href="/registar" className="underline">
                {pt.auth.registar}
              </a>
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}