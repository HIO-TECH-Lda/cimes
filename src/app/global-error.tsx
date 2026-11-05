"use client";

import { pt } from "@/i18n/pt-MZ";

/** Última linha de defesa: erro no layout raiz (fora da árvore de páginas). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-MZ">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{pt.errors.serverErrorTitle}</h1>
        <p style={{ color: "#555", marginTop: "0.5rem" }}>{pt.errors.serverErrorDescription}</p>
        <button
          onClick={reset}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", cursor: "pointer" }}
        >
          {pt.errors.voltarInicio}
        </button>
      </body>
    </html>
  );
}