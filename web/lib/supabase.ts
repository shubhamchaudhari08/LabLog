'use client';

/**
 * Browser Supabase client — anon key plus the user's own session.
 *
 * Reads go direct: row-level security already enforces exactly the scoping a
 * read proxy would re-implement, and the browser's key carries the user's
 * identity into the database. Writes are different and must go through
 * FastAPI, because they need validation the database cannot express
 * (contracts/db-read.md).
 */

import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
