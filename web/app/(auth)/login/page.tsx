'use client';

/**
 * Magic-link sign-in. One demo account is all the MVP needs, but the record
 * still has a real owner — which is what makes the ownership check meaningful.
 */

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.appUrl}/dashboard` },
    });

    setBusy(false);
    if (authError) setError(authError.message);
    else setSent(true);
  }

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-lg">
      <h1 className="text-display-lg">LabLog</h1>
      <p className="mt-xs text-body-md text-muted">
        Voice-native laboratory notebook.
      </p>

      {sent ? (
        <p className="mt-xl rounded-lg border border-hairline bg-surface-card px-lg py-md text-body-sm text-body">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-xl space-y-sm">
          <label htmlFor="email" className="block text-caption-upper uppercase text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-md border border-hairline bg-canvas px-sm text-body-md text-ink transition-colors hover:border-muted-soft focus:border-primary"
            placeholder="you@lab.org"
          />
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {busy ? 'Sending…' : 'Send sign-in link'}
          </button>
          {error && <p className="text-caption text-error">{error}</p>}
        </form>
      )}

      {/* Guest mode is the default route; this form exists for real accounts. */}
      {!sent && (
        <Link
          href="/dashboard"
          className="mt-lg inline-block text-caption text-muted hover:text-ink"
        >
          ← Continue with the demo experiment
        </Link>
      )}
    </main>
  );
}
