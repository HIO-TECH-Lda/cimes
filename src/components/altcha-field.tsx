"use client";

import { useState } from "react";

import { sha256Hex } from "@/lib/sha256";
import { pt } from "@/i18n/pt-MZ";

/**
 * Captcha ALTCHA (RF-AUT-03): prova de trabalho SHA-256 no navegador, sem
 * serviço externo. O desafio vem de /api/captcha/altcha; o cliente procura o
 * `number` tal que sha256(salt+number) === challenge e submete o payload no
 * formato ALTCHA (JSON em base64, campo `altcha`), verificado no servidor com
 * `verifySolution` (HMAC + desafio + expiração). O widget oficial do pacote
 * `altcha` foi trocado por esta implementação própria: o elemento custom não
 * cooperava com React 19 (props/atributos) e o CSP de worker complicava o
 * upgrade; a prova continua compatível com o esquema ALTCHA.
 */

type Challenge = { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string };

export function AltchaField({ challengeUrl }: { challengeUrl: string }) {
  const [estado, setEstado] = useState<"por-resolver" | "a-resolver" | "verificado" | "erro">("por-resolver");
  const [payload, setPayload] = useState("");

  async function resolver(): Promise<void> {
    if (estado === "a-resolver" || estado === "verificado") return;
    setEstado("a-resolver");
    try {
      const ch = (await fetch(challengeUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("desafio indisponível");
        return r.json() as Promise<Challenge>;
      })) as Challenge;

      let number = -1;
      for (let n = 0; n <= ch.maxnumber; n++) {
        if (sha256Hex(`${ch.salt}${n}`) === ch.challenge) {
          number = n;
          break;
        }
        // Cede o fio a cada 2 000 iterações para a UI continuar responsiva.
        if (n % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (number < 0) throw new Error("sem solução");

      setPayload(
        btoa(
          JSON.stringify({
            algorithm: ch.algorithm,
            challenge: ch.challenge,
            number,
            salt: ch.salt,
            signature: ch.signature,
          }),
        ),
      );
      setEstado("verificado");
    } catch {
      setEstado("erro");
    }
  }

  const etiqueta =
    estado === "verificado"
      ? pt.altcha.verificado
      : estado === "a-resolver"
        ? pt.altcha.verificando
        : estado === "erro"
          ? pt.altcha.erro
          : pt.altcha.label;

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={estado === "a-resolver" || estado === "verificado"}
        onChange={() => void resolver()}
        required
        aria-label={pt.altcha.label}
        className="h-4 w-4"
      />
      <span className="text-muted-foreground text-sm">{etiqueta}</span>
      <input type="hidden" name="altcha" value={payload} />
    </div>
  );
}