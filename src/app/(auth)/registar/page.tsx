import { pt } from "@/i18n/pt-MZ";
import { AltchaField } from "@/components/altcha-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createConsentRepository } from "@/server/repositories/consent-repository";
import { getPrismaClient } from "@/server/repositories/db";

const ERROS: Record<string, string> = {
  senhasDiferentes: pt.auth.erroSenhasDiferentes,
  captchaFalhou: pt.auth.captchaFalhou,
  senhaInvalida: pt.auth.senhaInvalida,
  aceiteObrigatorio: pt.auth.aceiteObrigatorio,
};

/** Registo de candidato (RF-AUT-03): aviso de privacidade obrigatório, bolsa opcional, ALTCHA, verificação de e-mail. */
export default async function RegistarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const notice = await createConsentRepository(getPrismaClient()).currentPublishedNotice();
  const erro = params.erro ? (ERROS[params.erro] ?? pt.auth.captchaFalhou) : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{pt.auth.registar}</CardTitle>
        {notice ? (
          <CardDescription>
            {pt.auth.avisoPrivacidade}: {notice.title} (v{notice.version})
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {params.ok ? (
          <Alert>
            <AlertDescription>{pt.auth.verificacaoEnviada}</AlertDescription>
          </Alert>
        ) : null}
        {erro ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : null}
        <form action="/api/registar" method="post" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{pt.auth.nome}</Label>
            <Input id="name" name="name" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{pt.auth.email}</Label>
            <Input id="email" name="email" type="email" required maxLength={254} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{pt.auth.senha}</Label>
            <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{pt.auth.confirmarSenha}</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
          </div>
          {notice ? (
            <div className="flex items-start gap-2">
              <input id="notice" name="noticeAccepted" type="checkbox" required className="mt-1 h-4 w-4" />
              <Label htmlFor="notice" className="font-normal text-sm">
                {pt.auth.aceitarAviso}{" "}
                <input type="hidden" name="noticeVersionId" value={notice.id} />
              </Label>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{pt.auth.aceiteObrigatorio}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-start gap-2">
            <input id="talentPool" name="talentPool" type="checkbox" className="mt-1 h-4 w-4" />
            <Label htmlFor="talentPool" className="font-normal text-sm">
              {pt.auth.bolsaTalentos}
            </Label>
          </div>
          <AltchaField challengeUrl="/api/captcha/altcha" />
          <Button type="submit" className="w-full" disabled={!notice}>
            {pt.auth.registar}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}