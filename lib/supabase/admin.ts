import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Use only on the server (route handlers /
 * server actions) and never inside a request that runs with user privileges.
 * Bypasses RLS — needed for storage operations that admin the bucket itself
 * (createBucket, public-URL invoice PDFs, etc).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
