import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth/better-auth";

/**
 * Route Handler do Better Auth (`/api/auth/*`, G.2: Route Handlers para autenticação).
 */
export const { GET, POST } = toNextJsHandler(getAuth().handler);