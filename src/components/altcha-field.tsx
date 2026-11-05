"use client";

import { createElement, useEffect, useRef } from "react";

/**
 * Widget ALTCHA (RF-AUT-03): prova de trabalho no navegador, serviço externo
 * nenhum. O desafio vem de /api/captcha/altcha; a solução submete-se no campo
 * `altcha` do formulário, verificado no servidor (verifySolution).
 */
export function AltchaField({ challengeUrl }: { challengeUrl: string }) {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void import("altcha");
  }, []);

  return createElement("altcha-widget", {
    challengeurl: challengeUrl,
    name: "altcha",
    hidefooter: true,
    strings: JSON.stringify({
      label: "Não sou um robô",
      verifying: "A verificar…",
      verified: "Verificado",
      error: "Falhou. Tenta de novo.",
    }),
  });
}