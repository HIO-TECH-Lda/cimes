/**
 * Política de senhas (RF-AUT-04): pelo menos 10 caracteres; rejeitar as 10 000
 * senhas mais comuns (lista local no repositório, fonte SecLists/darkweb2017,
 * MIT) e senhas que contenham o e-mail. O hashing é feito pelo Better Auth.
 */

import { COMMON_PASSWORDS_10K } from "@/server/auth/data/common-passwords";

const MIN_LENGTH = 10;

const commonPasswords: Set<string> = new Set(
  COMMON_PASSWORDS_10K.map((line) => line.trim().toLowerCase()).filter((line) => line.length > 0),
);

export type PasswordIssue = {
  code: "TOO_SHORT" | "COMMON" | "CONTAINS_EMAIL";
  message: string;
};

/** Valida a política RF-AUT-04. Devolve a lista de problemas (vazio = válida). */
export function validatePassword(email: string, password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < MIN_LENGTH) {
    issues.push({
      code: "TOO_SHORT",
      message: "A senha deve ter pelo menos 10 caracteres",
    });
  }
  const lower = password.toLowerCase();
  if (commonPasswords.has(lower)) {
    issues.push({
      code: "COMMON",
      message: "Esta senha está na lista das mais comuns e não pode ser usada",
    });
  }
  const emailLower = email.trim().toLowerCase();
  if (emailLower.length > 0 && lower.includes(emailLower)) {
    issues.push({
      code: "CONTAINS_EMAIL",
      message: "A senha não pode conter o e-mail",
    });
  }
  return issues;
}