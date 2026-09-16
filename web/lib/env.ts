/**
 * Public configuration only.
 *
 * Everything reachable from here is shipped to the browser. Privileged names
 * live in api/ and are enforced absent from this tree by
 * scripts/check-secrets.sh (Constitution Principle III).
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};
