import { NextResponse } from "next/server";

import { getConfig } from "@/server/infra/config";

/**
 * RNF-13: `/api/health` (vivo) — responde sempre OK se o processo corre.
 */
export function GET(): NextResponse {
  const cfg = getConfig();
  return NextResponse.json({ status: "ok", app: "cimes", env: cfg.nodeEnv, time: new Date().toISOString() });
}