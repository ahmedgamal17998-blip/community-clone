/**
 * Re-export of NextAuth handlers.
 *
 * This indirection exists so the /api/auth/[...nextauth]/route.ts file stays
 * tiny and so @/server/auth.ts can evolve without churn.
 */
import { handlers } from "@/server/auth";
export const { GET, POST } = handlers;
