'use client';

/**
 * Magic-link sign-in. One demo account is all the MVP needs, but the record
 * still has a real owner — which is what makes the ownership check meaningful.
 *
 * The dark half shows what the product does in one exchange: a sentence spoken,
 * a value stored.
 */

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { IconArrow, IconCheck, IconMic, Logo } from '@/components/icons';

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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-surface-dark p-xxl text-on-dark lg:flex lg:flex-col">
        <span aria-hidden className="absolute -left-32 top-1/3 h-96 w-96 rounded-pill bg-primary/20 blur-3xl" />
        <span aria-hidden className="absolute -bottom-24 right-0 h-72 w-72 rounded-pill bg-accent-teal/10 blur-3xl" />

        <div className="relative flex items-center gap-sm">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
            <Logo className="h-5 w-5" />
          </span>
          <span className="font-display text-[24px]">LabLog</span>
        </div>

        <div className="relative my-auto max-w-[460px]">
          <h1 className="text-display-lg text-on-dark">Say it once. It&rsquo;s in the record.</h1>
          <p className="mt-md text-body-md text-on-dark-soft">
            Speak readings at the bench. Each one is validated, stored against the right sample and
            protocol step, and read back to you.
          </p>

          <div className="mt-xl space-y-sm">
            <div className="flex animate-slide-up items-center gap-sm rounded-lg bg-white/[0.05] px-md py-sm [animation-delay:200ms]">
              <span className="grid h-8 w-8 place-items-center rounded-pill bg-primary text-on-primary">
                <IconMic className="h-4 w-4" />
              </span>
              <span className="font-mono text-body-sm">“A17 is 4.2 Celsius”</span>
              <span className="ml-auto flex h-4 items-center gap-[3px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="h-full w-[3px] animate-bar rounded-pill bg-primary"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
            </div>
            <div className="ml-xl flex animate-slide-up items-center gap-sm rounded-lg border border-accent-teal/20 bg-accent-teal/[0.07] px-md py-sm [animation-delay:700ms]">
              <IconCheck className="h-4 w-4 text-accent-teal" />
              <span className="font-mono text-body-sm text-on-dark">A17</span>
              <span className="text-body-sm text-on-dark-soft">temperature</span>
              <span className="tabular ml-auto font-display text-[24px] leading-none">
                4.2 <span className="font-sans text-caption text-on-dark-soft">C</span>
              </span>
            </div>
          </div>
        </div>

        <p className="relative text-caption text-on-dark-soft/70">
          Every change is audited. Corrections supersede; nothing is overwritten.
        </p>
      </aside>

      <main id="main" className="flex flex-col justify-center px-lg py-xxl">
        <div className="mx-auto w-full max-w-[380px] animate-rise">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-surface-dark text-primary lg:hidden">
            <Logo className="h-6 w-6" />
          </span>
          <h2 className="mt-md text-display-md lg:mt-0">Sign in</h2>
          <p className="mt-xs text-body-md text-muted">We&rsquo;ll email you a one-time sign-in link.</p>

          {sent ? (
            <div className="mt-xl animate-slide-up rounded-lg border border-accent-teal/30 bg-accent-teal/[0.06] px-lg py-md">
              <p className="text-body-sm font-medium text-ink">Check your inbox</p>
              <p className="mt-xxs text-body-sm text-muted">
                A sign-in link is on its way to <span className="text-ink">{email}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-xl space-y-sm" noValidate={false}>
              <label htmlFor="email" className="block text-caption text-muted">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input h-11"
                placeholder="you@lab.org"
                aria-invalid={Boolean(error)}
              />
              <button type="submit" className="btn-primary h-11 w-full justify-center" disabled={busy}>
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
              {error && (
                <p className="text-caption text-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}

          {/* Guest mode is the default route; this form exists for real accounts. */}
          {!sent && (
            <>
              <div className="my-lg flex items-center gap-sm text-caption text-muted-soft">
                <span className="h-px flex-1 bg-hairline" />
                or
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <Link href="/dashboard" className="btn-secondary group h-11 w-full justify-center">
                Continue with the demo experiment
                <IconArrow className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]" />
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
