import { getAuth } from "./better-auth";

/**
 * Instância para o CLI do Better Auth (`@better-auth/cli generate`) — não usar
 * na aplicação; usar `getAuth()` de better-auth.ts.
 */
export const auth = getAuth();