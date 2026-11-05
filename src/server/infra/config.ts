import { z } from "zod";

/**
 * RNF-05: as variáveis de ambiente são validadas com Zod no arranque; a aplicação e
 * o worker não arrancam se faltar uma obrigatória. `.env.example` (Anexo I) nunca
 * contém valores reais (R-12).
 */

const base64Key32 = z
  .string()
  .refine(
    (v) => {
      try {
        return Buffer.from(v, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: "Esperada uma chave Base64 de 32 bytes" },
  );

const keyRingSchema = z
  .record(z.string().min(1).max(40), base64Key32)
  .refine((r) => Object.keys(r).length > 0, { message: "Pelo menos uma chave é obrigatória" });

/** Analisa e valida um porta-chaves (`{ "id": "chave-base64-32" }`) vindo do ambiente. */
function keyRingField() {
  return z.string().transform((v, ctx) => {
    let raw: unknown;
    try {
      raw = JSON.parse(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "JSON inválido" });
      return z.NEVER;
    }
    const parsed = keyRingSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: [] });
      return z.NEVER;
    }
    return parsed.data;
  });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_BASE_URL: z.url(),
  TZ: z.string().default("Africa/Maputo"),
  NEXT_TELEMETRY_DISABLED: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  INTERNAL_ALLOWED_CIDRS: z.string().default("10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"),
  HR_NOTIFICATIONS_EMAIL: z.email().optional(),

  DATABASE_URL: z.string().min(1).regex(/^sqlserver:\/\//, "Deve ser um URL sqlserver://"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),
  STAFF_AUTH_MODE: z.enum(["entra", "local"]).default("entra"),
  MICROSOFT_TENANT_ID: z.string().optional(),
  ALTCHA_HMAC_KEY: z.string().optional(),

  FILE_STORAGE_PATH: z.string().min(1),
  FILE_ENCRYPTION_KEYS: keyRingField(),
  FILE_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
  PII_ENCRYPTION_KEYS: keyRingField(),
  PII_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
  PII_HMAC_KEY: base64Key32,

  MAIL_TRANSPORT: z.enum(["graph", "smtp-oauth2", "smtp-relay", "dev", "memory"]),
  MAIL_FROM: z.string().optional(),
  MAIL_SENDER_UPN: z.string().optional(),

  AI_PROVIDER: z.enum(["disabled", "mock", "azure", "openai"]).default("disabled"),
  AI_FEATURE_TRANSCRIPT: z.coerce.boolean().default(false),
  AI_FEATURE_CV: z.coerce.boolean().default(false),
  AI_FEATURE_NLQ: z.coerce.boolean().default(false),
  AI_DAILY_MAX_CALLS: z.coerce.number().int().min(1).default(500),

  AV_SCAN: z.enum(["none", "clamav"]).default("none"),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  isProduction: boolean;
  publicBaseUrl: string;
  timezone: string;
  logLevel: "debug" | "info" | "warn" | "error";
  internalAllowedCidrs: string[];
  databaseUrl: string;
  databasePoolMax: number;
  betterAuthSecret: string;
  staffAuthMode: "entra" | "local";
  fileStoragePath: string;
  fileEncryptionKeys: Record<string, string>;
  fileEncryptionActiveKeyId: string;
  piiEncryptionKeys: Record<string, string>;
  piiEncryptionActiveKeyId: string;
  piiHmacKey: string;
  mailTransport: "graph" | "smtp-oauth2" | "smtp-relay" | "dev" | "memory";
  mailFrom?: string;
  mailSenderUpn?: string;
  aiProvider: "disabled" | "mock" | "azure" | "openai";
  aiFeatures: { transcript: boolean; cv: boolean; nlq: boolean };
  aiDailyMaxCalls: number;
  avScan: "none" | "clamav";
};

/** Valida o ambiente e devolve a configuração tipada. Lança com mensagens claras. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida — a aplicação não vai arrancar (RNF-05). Problemas: ${issues}`);
  }
  const v = result.data;
  if (!Object.hasOwn(v.FILE_ENCRYPTION_KEYS, v.FILE_ENCRYPTION_ACTIVE_KEY_ID)) {
    throw new Error("FILE_ENCRYPTION_ACTIVE_KEY_ID não existe em FILE_ENCRYPTION_KEYS");
  }
  if (!Object.hasOwn(v.PII_ENCRYPTION_KEYS, v.PII_ENCRYPTION_ACTIVE_KEY_ID)) {
    throw new Error("PII_ENCRYPTION_ACTIVE_KEY_ID não existe em PII_ENCRYPTION_KEYS");
  }
  return {
    nodeEnv: v.NODE_ENV,
    isProduction: v.NODE_ENV === "production",
    publicBaseUrl: v.PUBLIC_BASE_URL,
    timezone: v.TZ,
    logLevel: v.LOG_LEVEL,
    internalAllowedCidrs: v.INTERNAL_ALLOWED_CIDRS.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
    databaseUrl: v.DATABASE_URL,
    databasePoolMax: v.DATABASE_POOL_MAX,
    betterAuthSecret: v.BETTER_AUTH_SECRET,
    staffAuthMode: v.STAFF_AUTH_MODE,
    fileStoragePath: v.FILE_STORAGE_PATH,
    fileEncryptionKeys: v.FILE_ENCRYPTION_KEYS,
    fileEncryptionActiveKeyId: v.FILE_ENCRYPTION_ACTIVE_KEY_ID,
    piiEncryptionKeys: v.PII_ENCRYPTION_KEYS,
    piiEncryptionActiveKeyId: v.PII_ENCRYPTION_ACTIVE_KEY_ID,
    piiHmacKey: v.PII_HMAC_KEY,
    mailTransport: v.MAIL_TRANSPORT,
    mailFrom: v.MAIL_FROM,
    mailSenderUpn: v.MAIL_SENDER_UPN,
    aiProvider: v.AI_PROVIDER,
    aiFeatures: { transcript: v.AI_FEATURE_TRANSCRIPT, cv: v.AI_FEATURE_CV, nlq: v.AI_FEATURE_NLQ },
    aiDailyMaxCalls: v.AI_DAILY_MAX_CALLS,
    avScan: v.AV_SCAN,
  };
}

let cached: AppConfig | null = null;

/** Configuração em cache por processo (a validação corre uma única vez no arranque). */
export function getConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Reservado para testes. */
export function resetConfigCache(): void {
  cached = null;
}