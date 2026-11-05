"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { pt } from "@/i18n/pt-MZ";
import { createAuthClient } from "better-auth/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordIssue } from "@/server/auth/password";

const authClient = createAuthClient();

/**
 * Recuperação de senha (RF-AUT-05): pedido (N-02, link de 60 min) e
 * redefinição com o token do link. Sem enumeração de contas: o pedido mostra
 * sempre a mesma mensagem neutra. A política de senha é verificada no
 * servidor (/api/repor-senha/validar) antes do Better Auth repor.
 */
export function ReporSenhaForms() {
  const params = useSearchParams();
  const token = params.get("token");
  const erroCallback = params.get("error") === "INVALID_TOKEN";

  const [email, setEmail] = useState("");
  const [aPedir, setAPedir] = useState(false);
  const [pedidoEstado, setPedidoEstado] = useState<"nada" | "enviado" | "erro">("nada");

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [aRepor, setARepor] = useState(false);
  const [problemas, setProblemas] = useState<PasswordIssue[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setAPedir(true);
    setPedidoEstado("nada");
    try {
      const { error } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: "/repor-senha" });
      setPedidoEstado(error ? "erro" : "enviado");
    } catch {
      setPedidoEstado("erro");
    } finally {
      setAPedir(false);
    }
  }

  async function repor(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setProblemas(null);
    if (senha !== confirmar) {
      setErro(pt.reporSenha.senhasDiferentes);
      return;
    }
    setARepor(true);
    try {
      const validacao = await fetch("/api/repor-senha/validar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (!validacao.ok) {
        setErro(pt.reporSenha.erroToken);
        return;
      }
      const { problemas: problemasServidor } = (await validacao.json()) as { problemas: PasswordIssue[] };
      if (problemasServidor.length > 0) {
        setProblemas(problemasServidor);
        return;
      }
      const { error } = await authClient.resetPassword({ newPassword: senha, token: token ?? undefined });
      if (error) {
        setErro(pt.reporSenha.erroToken);
        return;
      }
      setSucesso(true);
    } catch {
      setErro(pt.reporSenha.erroToken);
    } finally {
      setARepor(false);
    }
  }

  if (token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{pt.reporSenha.novaTitulo}</CardTitle>
          <CardDescription>{pt.reporSenha.novaDescricao}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sucesso ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>{pt.reporSenha.sucesso}</AlertDescription>
              </Alert>
              <p className="text-muted-foreground text-sm">{pt.reporSenha.sucessoDescricao}</p>
              <Button asChild className="w-full">
                <a href="/entrar">{pt.reporSenha.voltarEntrar}</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void repor(e)} className="space-y-4">
              {erro ? (
                <Alert variant="destructive">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              ) : null}
              {problemas && problemas.length > 0 ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {problemas.map((p) => (
                        <li key={p.code}>{p.message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="nova-senha">{pt.reporSenha.novaSenha}</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  required
                  minLength={10}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar-senha">{pt.reporSenha.confirmar}</Label>
                <Input
                  id="confirmar-senha"
                  type="password"
                  required
                  minLength={10}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={aRepor}>
                {pt.reporSenha.repor}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{pt.reporSenha.pedidoTitulo}</CardTitle>
        <CardDescription>{pt.reporSenha.pedidoDescricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erroCallback ? (
          <Alert variant="destructive">
            <AlertDescription>{pt.reporSenha.erroToken}</AlertDescription>
          </Alert>
        ) : null}
        {pedidoEstado === "enviado" ? (
          <Alert>
            <AlertDescription>{pt.reporSenha.enviado}</AlertDescription>
          </Alert>
        ) : null}
        {pedidoEstado === "erro" ? (
          <Alert variant="destructive">
            <AlertDescription>{pt.reporSenha.erroEnviar}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={(e) => void pedir(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-r">{pt.reporSenha.email}</Label>
            <Input
              id="email-r"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Button type="submit" className="w-full" disabled={aPedir}>
            {pt.reporSenha.enviar}
          </Button>
        </form>
        <p className="text-sm">
          <a href="/entrar" className="text-muted-foreground underline">
            {pt.reporSenha.voltarEntrar}
          </a>
        </p>
      </CardContent>
    </Card>
  );
}