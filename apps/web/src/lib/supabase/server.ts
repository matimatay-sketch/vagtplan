import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/** The impersonation session id (not secret) and the sealed admin session. */
export const IMPERSONATION_COOKIE = "turnus_imp";
export const IMPERSONATOR_COOKIE = "turnus_imp_admin";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  // While an administrator is logged in as an employee, the database records the
  // administrator on every change (it checks the session id against auth.uid()).
  const impersonation = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    ...(impersonation && /^[0-9a-f-]{36}$/.test(impersonation)
      ? { global: { headers: { "x-turnus-impersonation": impersonation } } }
      : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Service client that bypasses RLS. Only for narrowly scoped admin tasks (invites). */
export function createServiceClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY");
  return createPlainClient<Database>(env.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
