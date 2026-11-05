import { NextResponse } from "next/server";

import { getConfig } from "@/server/infra/config";
import { getProcessLogger } from "@/server/infra/logger";
import { storageWriteProbe } from "@/server/infra/storage";
import { getPrismaClient, pingDatabase } from "@/server/repositories/db";

/**
 * RNF-13: `/api/health/ready` (base de dados e armazenamento).
 */
export async function GET(): Promise<NextResponse> {
  const cfg = getConfig();
  const checks: Record<string, "ok" | "falhou"> = {};
  let ok = true;

  try {
    await pingDatabase(getPrismaClient());
    checks.database = "ok";
  } catch (error) {
    checks.database = "falhou";
    ok = false;
    getProcessLogger().error({ err: error instanceof Error ? error.message : "desconhecido" }, "health/ready: base de dados indisponível");
  }

  try {
    storageWriteProbe(cfg.fileStoragePath);
    checks.storage = "ok";
  } catch (error) {
    checks.storage = "falhou";
    ok = false;
    getProcessLogger().error({ err: error instanceof Error ? error.message : "desconhecido" }, "health/ready: armazenamento indisponível");
  }

  return NextResponse.json(
    { status: ok ? "ok" : "degradado", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}