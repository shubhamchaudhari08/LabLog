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
  /**
   * Demo account, so reviewers never meet a login form. Public by design — it
   * owns nothing but seeded, fictional data. Auth itself is NOT bypassed: this
   * signs in for real, so every request still carries a genuine JWT and the
   * ownership check in the backend still runs. Leave unset to require login.
   */
  demoEmail: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '',
  demoPassword: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};
