import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { createChallenge } from "@/server/auth/altcha";
import { getConfig } from "@/server/infra/config";

/**
 * Desafio ALTCHA (RF-AUT-03): prova de trabalho local, sem serviço externo.
 * O widget submete a solução no campo `altcha`; os serviços verificam com
 * `verifySolution` usando a mesma chave HMAC (RNF-05: segredo só em env).
 */
export async function GET() {
  const cfg = getConfig();
  const challenge = createChallenge(cfg.altchaHmacKey ?? "");
  const body = {
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    maxnumber: challenge.maxnumber,
    salt: challenge.salt,
    signature: challenge.signature,
  };
  // Cabeçalho no-pstore do ALTCHA e id de cache curto.
  const idempotency = createHash("sha256").update(challenge.challenge).digest("hex").slice(0, 16);
  return NextResponse.json(body, {
    headers: {
      "cache-control": "no-store",
      "x-altcha-id": idempotency,
    },
  });
}