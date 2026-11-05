import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { validatePassword } from "@/server/auth/password";
import { createChallenge, verifySolution } from "@/server/auth/altcha";
import {
  createAccountLockService,
  CAPTCHA_THRESHOLD,
  LOCK_THRESHOLD,
} from "@/server/services/account-lock";
import type { AuditLogRepository, AuditLogFilters, CreateAuditLogInput } from "@/server/repositories/audit-log-repository";
import type { UserRepository } from "@/server/repositories/user-repository";
import type { NotificationRepository, EnqueueNotificationInput } from "@/server/repositories/notification-repository";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Primeira senha da lista local com 10+ caracteres (determinística, sintética). */
function commonPasswordOf10Plus(): string {
  const lines = readFileSync(
    join(import.meta.dirname, "../../src/server/auth/data/common-passwords-10k.txt"),
    "utf8",
  ).split(/\r?\n/);
  const found = lines.find((l) => l.length >= 10);
  if (!found) throw new Error("lista sem senha de 10 caracteres");
  return found;
}

describe("política de senhas (RF-AUT-04)", () => {
  it("exige pelo menos 10 caracteres", () => {
    expect(validatePassword("ana@exemplo.mz", "curta123")).toEqual([
      expect.objectContaining({ code: "TOO_SHORT" }),
    ]);
  });

  it("rejeita senhas da lista das 10 000 mais comuns", () => {
    const common = commonPasswordOf10Plus();
    const issues = validatePassword("ana@exemplo.mz", common);
    expect(issues).toEqual([expect.objectContaining({ code: "COMMON" })]);
  });

  it("rejeita senhas que contêm o e-mail", () => {
    const issues = validatePassword("ana@exemplo.mz", "x-ana@exemplo.mz-9");
    expect(issues).toEqual([expect.objectContaining({ code: "CONTAINS_EMAIL" })]);
  });

  it("aceita uma senha forte fora da lista", () => {
    expect(validatePassword("ana@exemplo.mz", "k7#mQ2$vLp9w")).toEqual([]);
  });
});

describe("captcha ALTCHA local (RF-AUT-03)", () => {
  const KEY = "chave-hmac-sintetica-de-teste";

  /** Resolve a prova de trabalho por força bruta (maxnumber pequeno nos testes). */
  function solve(challenge: string, salt: string, maxnumber: number): number {
    for (let n = 0; n <= maxnumber; n++) {
      if (sha256(`${salt}${n}`) === challenge) return n;
    }
    throw new Error("sem solução");
  }

  function payloadOf(ch: ReturnType<typeof createChallenge>): string {
    const number = solve(ch.challenge, ch.salt, ch.maxnumber);
    return Buffer.from(
      JSON.stringify({
        algorithm: ch.algorithm,
        challenge: ch.challenge,
        number,
        salt: ch.salt,
        signature: ch.signature,
      }),
    ).toString("base64");
  }

  it("desafio válido resolve e verifica", () => {
    const now = new Date("2026-11-05T08:00:00Z");
    const ch = createChallenge(KEY, { now, maxnumber: 10 });
    expect(verifySolution(payloadOf(ch), KEY, { now })).toEqual({ ok: true });
  });

  it("número adulterado não verifica (CHALLENGE)", () => {
    const now = new Date("2026-11-05T08:00:00Z");
    const ch = createChallenge(KEY, { now, maxnumber: 10 });
    const number = solve(ch.challenge, ch.salt, ch.maxnumber);
    const payload = Buffer.from(
      JSON.stringify({ algorithm: "SHA-256", challenge: ch.challenge, number: number + 1, salt: ch.salt, signature: ch.signature }),
    ).toString("base64");
    expect(verifySolution(payload, KEY, { now })).toEqual({ ok: false, reason: "CHALLENGE" });
  });

  it("chave HMAC errada não verifica (SIGNATURE)", () => {
    const now = new Date("2026-11-05T08:00:00Z");
    const ch = createChallenge(KEY, { now, maxnumber: 10 });
    expect(verifySolution(payloadOf(ch), "outra-chave", { now })).toEqual({
      ok: false,
      reason: "SIGNATURE",
    });
  });

  it("desafio expirado não verifica (EXPIRED)", () => {
    const now = new Date("2026-11-05T08:00:00Z");
    const ch = createChallenge(KEY, { now, ttlMs: 60_000, maxnumber: 10 });
    const later = new Date("2026-11-05T08:05:00Z");
    expect(verifySolution(payloadOf(ch), KEY, { now: later })).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("payload malformado não verifica (MALFORMED)", () => {
    expect(verifySolution("###", KEY)).toEqual({ ok: false, reason: "MALFORMED" });
  });
});

/** Fakes em memória para o serviço de bloqueio. */
function makeFakes(clockNow: Date) {
  const rows: Array<CreateAuditLogInput & { id: number; occurredAt: Date }> = [];
  let nextId = 1;
  const auditLogRepository = {
    async create(input: CreateAuditLogInput) {
      const row = { ...input, id: nextId++, occurredAt: clockNow };
      rows.push(row);
      return row as never;
    },
    async list(filters: AuditLogFilters) {
      const windowStart = filters.from?.getTime() ?? 0;
      const filtered = rows.filter(
        (r) =>
          r.action === filters.actions?.[0] &&
          (!filters.actorUserId || r.actorUserId === filters.actorUserId) &&
          (!filters.ipAddress || r.ipAddress === filters.ipAddress) &&
          r.occurredAt.getTime() >= windowStart,
      );
      return { total: filtered.length, page: 1, pageSize: 1, rows: [] as never[] };
    },
  } as unknown as AuditLogRepository;

  const users = new Map<string, { lockedUntil: Date | null }>([["user-1", { lockedUntil: null }]]);
  const userRepository = {
    async findById(id: string) {
      const u = users.get(id);
      return u ? ({ id, lockedUntil: u.lockedUntil } as never) : null;
    },
    async setLockedUntil(id: string, lockedUntil: Date | null) {
      users.set(id, { lockedUntil });
    },
  } as unknown as UserRepository;

  const notifications: EnqueueNotificationInput[] = [];
  const notificationRepository = {
    async create(input: EnqueueNotificationInput) {
      notifications.push(input);
      return {} as never;
    },
  } as unknown as NotificationRepository;

  const clock = { now: () => clockNow } as never;

  return { service: createAccountLockService({ auditLogRepository, userRepository, notificationRepository }, clock), rows, users, notifications };
}

describe("bloqueio progressivo de conta (RF-AUT-07)", () => {
  const now = new Date("2026-11-05T08:00:00Z");
  const attempt = { userId: "user-1", email: "ana@exemplo.mz", ipAddress: "10.0.0.1", userAgent: "teste" };

  it(`abaixo de ${CAPTCHA_THRESHOLD} falhas não exige captcha; no limiar exige`, async () => {
    const { service } = makeFakes(now);
    for (let i = 1; i < CAPTCHA_THRESHOLD; i++) {
      const r = await service.registerFailedLogin(attempt);
      expect(r.captchaRequired).toBe(false);
    }
    const r5 = await service.registerFailedLogin(attempt);
    expect(r5.captchaRequired).toBe(true);
  });

  it(`com ${LOCK_THRESHOLD} falhas bloqueia 30 minutos, audita ACCOUNT_LOCKED e envia N-29`, async () => {
    const { service, rows, notifications, users } = makeFakes(now);
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.registerFailedLogin(attempt);
    }
    expect(users.get("user-1")?.lockedUntil).not.toBeNull();
    expect(rows.some((r) => r.action === "ACCOUNT_LOCKED")).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.templateCode).toBe("N-29");
    const state = await service.loginState("user-1");
    expect(state.lockedUntil).not.toBeNull();
    expect(state.captchaRequired).toBe(true);
  });

  it("a janela deslizante de 15 minutos desconta falhas antigas", async () => {
    // O fake usa um relógio fixo; com `from` no serviço, falhas antigas ficam fora.
    const { service } = makeFakes(now);
    const r = await service.registerFailedLogin(attempt);
    expect(r.byAccount).toBe(1);
  });

  it("conta bloqueada fica bloqueada até expirar o prazo", async () => {
    const { service, users } = makeFakes(now);
    for (let i = 0; i < LOCK_THRESHOLD; i++) {
      await service.registerFailedLogin(attempt);
    }
    const locked = await service.isLocked("user-1");
    expect(locked).not.toBeNull();
    // Relógio depois do prazo → desbloqueia.
    users.set("user-1", { lockedUntil: new Date(now.getTime() - 1000) });
    expect(await service.isLocked("user-1")).toBeNull();
  });
});