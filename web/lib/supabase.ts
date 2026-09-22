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

import { createClient, type Session } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Return the current session, signing in as the demo account if there is none.
 *
 * This is guest mode: no auth is skipped, a real session is created. If the demo
 * credentials are unset it returns null and the caller sends you to /login.
 */
export async function ensureSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  if (!env.demoEmail || !env.demoPassword) return null;

  const { data: signedIn } = await supabase.auth.signInWithPassword({
    email: env.demoEmail,
    password: env.demoPassword,
  });
  return signedIn.session ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  return (await ensureSession())?.access_token ?? null;
}
