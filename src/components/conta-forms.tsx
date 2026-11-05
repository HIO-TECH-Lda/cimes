"use client";

import { useEffect, useState } from "react";

import { pt } from "@/i18n/pt-MZ";
import { createAuthClient } from "better-auth/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authClient = createAuthClient();

export type ContaDados = {
  nome: string;
  email: string;
  tokenSessao: string;
};

type SessaoActiva = {
  token: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  userAgent?: string | null;
  ipAddress?: string | null;
};

/**
 * "A minha conta" (RF-AUT-06, RF-AUT-10): dados, mudança de e-mail
 * (RF-AUT-08: exige senha actual, verificada em /api/conta/mudar-email; a
 * confirmação vai para o endereço antigo), mudança de senha e o ecrã
 * "Sessões activas" com opção de terminar cada sessão. A autorização corre
 * no Better Auth (só a própria sessão do titular).
 */
export function ContaForms({ utilizador }: { utilizador: ContaDados }) {
  const [nome, setNome] = useState(utilizador.nome);
  const [novoEmail, setNovoEmail] = useState("");
  const [senhaEmail, setSenhaEmail] = useState("");
  const [senhaActual, setSenhaActual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [terminarOutras, setTerminarOutras] = useState(false);
  const [sessoes, setSessoes] = useState<SessaoActiva[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void authClient.listSessions().then(({ data }) => setSessoes(data ?? []));
  }, [msg]);

  function mostrar(mensagem: string, negativo = false): void {
    setMsg(negativo ? null : mensagem);
    setErro(negativo ? mensagem : null);
  }

  async function guardarDados(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setMsg(null);
    setErro(null);
    const { error } = await authClient.updateUser({ name: nome.trim() });
    setOcupado(false);
    if (error) return mostrar(pt.errors.serverErrorDescription, true);
    mostrar(pt.conta.dadosActualizados);
  }

  async function mudarEmail(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setMsg(null);
    setErro(null);
    const resposta = await fetch("/api/conta/mudar-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ novoEmail: novoEmail.trim().toLowerCase(), senhaActual: senhaEmail }),
    });
    setOcupado(false);
    if (!resposta.ok) return mostrar(pt.errors.serverErrorDescription, true);
    mostrar(pt.conta.emailPedido);
    setNovoEmail("");
    setSenhaEmail("");
  }

  async function mudarSenha(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErro(null);
    if (novaSenha !== confirmar) {
      return mostrar(pt.reporSenha.senhasDiferentes, true);
    }
    setOcupado(true);
    const { error } = await authClient.changePassword({
      currentPassword: senhaActual,
      newPassword: novaSenha,
      revokeOtherSessions: terminarOutras,
    });
    setOcupado(false);
    if (error) return mostrar(pt.errors.serverErrorDescription, true);
    mostrar(pt.conta.senhaAlterada);
    setSenhaActual("");
    setNovaSenha("");
    setConfirmar("");
  }

  async function terminar(token: string) {
    setOcupado(true);
    await authClient.revokeSession({ token });
    const { data } = await authClient.listSessions();
    setSessoes(data ?? []);
    setOcupado(false);
    mostrar(pt.conta.terminada);
  }

  async function terminarOutrasSessoes() {
    setOcupado(true);
    await authClient.revokeOtherSessions();
    const { data } = await authClient.listSessions();
    setSessoes(data ?? []);
    setOcupado(false);
    mostrar(pt.conta.terminada);
  }

  const outras = sessoes.filter((s) => s.token !== utilizador.tokenSessao);

  return (
    <div className="space-y-6">
      {msg ? (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{pt.conta.dadosTitulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void guardarDados(e)} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conta-nome">{pt.conta.nome}</Label>
              <Input id="conta-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
            </div>
            <div className="space-y-2">
              <Label>{pt.conta.email}</Label>
              <p className="text-muted-foreground text-sm">{utilizador.email}</p>
            </div>
            <Button type="submit" disabled={ocupado}>
              {pt.conta.guardarDados}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pt.conta.emailTitulo}</CardTitle>
          <CardDescription>{pt.conta.emailNota}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void mudarEmail(e)} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conta-novo-email">{pt.conta.novoEmail}</Label>
              <Input
                id="conta-novo-email"
                type="email"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conta-senha-email">{pt.conta.senhaActual}</Label>
              <Input
                id="conta-senha-email"
                type="password"
                value={senhaEmail}
                onChange={(e) => setSenhaEmail(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={ocupado}>
              {pt.conta.mudarEmail}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pt.conta.senhaTitulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void mudarSenha(e)} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conta-senha-actual">{pt.conta.senhaActual}</Label>
              <Input
                id="conta-senha-actual"
                type="password"
                value={senhaActual}
                onChange={(e) => setSenhaActual(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conta-nova-senha">{pt.conta.novaSenha}</Label>
              <Input
                id="conta-nova-senha"
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                minLength={10}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conta-confirmar">{pt.conta.confirmarNova}</Label>
              <Input
                id="conta-confirmar"
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                minLength={10}
                autoComplete="new-password"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={terminarOutras}
                onChange={(e) => setTerminarOutras(e.target.checked)}
                className="accent-primary"
              />
              {pt.conta.terminarOutras}
            </label>
            <Button type="submit" disabled={ocupado}>
              {pt.conta.mudarSenha}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pt.conta.sessoesTitulo}</CardTitle>
          <CardDescription>{pt.conta.sessoesDescricao}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{pt.conta.semOutras}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {sessoes.map((s) => {
                const actual = s.token === utilizador.tokenSessao;
                return (
                  <li key={s.token} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">
                        {actual ? `${pt.conta.sessaoActual} · ` : ""}
                        {pt.conta.iniciarEm} {new Date(s.createdAt).toLocaleString("pt-PT")}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {s.userAgent ?? "—"} · {s.ipAddress ?? "—"}
                      </span>
                    </div>
                    {!actual ? (
                      <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void terminar(s.token)}>
                        {pt.conta.terminar}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {outras.length > 0 ? (
            <Button variant="outline" disabled={ocupado} onClick={() => void terminarOutrasSessoes()}>
              {pt.conta.terminarTodas}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">{pt.conta.semOutras}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}