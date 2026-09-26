'use client';

/** Account: who is signed in, the name shown in the app, and local preferences. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { initials, useCurrentUser, usePageCrumbs } from '@/components/shell/AppShell';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { IconSignOut } from '@/components/icons';
import { supabase } from '@/lib/supabase';
import { applyReduceMotion, readReduceMotion } from '@/lib/prefs';

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-md border-t border-hairline py-xl first:border-0 first:pt-0 md:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="font-sans text-title-md text-ink">{title}</h2>
        <p className="mt-xxs max-w-[34ch] text-body-sm text-muted">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors duration-300 ${
        checked ? 'bg-primary' : 'bg-surface-cream-strong'
      }`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-pill bg-canvas shadow-panel transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export default function AccountSettings() {
  usePageCrumbs([{ label: 'Settings' }, { label: 'Account' }]);
  const user = useCurrentUser();
  const router = useRouter();
  const voice = useVoiceSession();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setName((user?.user_metadata?.display_name as string) ?? '');
  }, [user]);
  useEffect(() => setReduceMotion(readReduceMotion()), []);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() || null } });
    setSaving(false);
    setMessage(error ? { tone: 'error', text: error.message } : { tone: 'ok', text: 'Name saved.' });
  }

  async function signOut() {
    if (voice.live) voice.disconnect();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const created = user?.created_at
    ? new Date(user.created_at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <main id="main" className="page max-w-[1080px]">
      <header className="animate-rise">
        <p className="eyebrow">Settings</p>
        <h1 className="page-title mt-xs">Account</h1>
      </header>

      <div className="card mt-xl animate-slide-up p-lg sm:p-xl">
        <div className="flex flex-wrap items-center gap-lg border-b border-hairline pb-xl">
          <span className="grid h-16 w-16 place-items-center rounded-xl bg-surface-dark font-display text-[26px] text-primary">
            {initials(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-title-lg text-ink">{(user?.user_metadata?.display_name as string) || 'No name set'}</p>
            <p className="text-body-sm text-muted">{user?.email ?? 'Loading…'}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void signOut()}>
            <IconSignOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <div className="pt-xl">
          <Section title="Profile" hint="The name shown in the sidebar and on the overview.">
            <form onSubmit={saveName} className="max-w-[420px]">
              <label htmlFor="display-name" className="text-caption text-muted">
                Display name
              </label>
              <div className="mt-xxs flex gap-xs">
                <input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Raman"
                  maxLength={80}
                  className="input"
                />
                <button type="submit" className="btn-primary shrink-0" disabled={saving || !user}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {message && (
                <p
                  className={`mt-xs text-caption ${message.tone === 'ok' ? 'text-[#3f8a52]' : 'text-error'}`}
                  role="status"
                >
                  {message.text}
                </p>
              )}
            </form>
          </Section>

          <Section title="Sign-in" hint="Managed by Supabase Auth. The email can't be changed here.">
            <dl className="grid max-w-[520px] grid-cols-[120px_minmax(0,1fr)] gap-y-sm text-body-sm">
              <dt className="text-muted-soft">Email</dt>
              <dd className="truncate text-ink">{user?.email ?? '—'}</dd>
              <dt className="text-muted-soft">User id</dt>
              <dd className="truncate font-mono text-[13px] text-body">{user?.id ?? '—'}</dd>
              <dt className="text-muted-soft">Member since</dt>
              <dd className="text-ink">{created}</dd>
            </dl>
          </Section>

          <Section title="Preferences" hint="Stored in this browser only.">
            <div className="flex max-w-[520px] items-start justify-between gap-md rounded-lg bg-surface-soft p-md">
              <div>
                <p className="text-body-sm font-medium text-ink">Reduce motion</p>
                <p className="mt-[2px] text-caption text-muted">
                  Turns off step transitions, pulses and the listening animation.
                </p>
              </div>
              <Toggle
                label="Reduce motion"
                checked={reduceMotion}
                onChange={(on) => {
                  setReduceMotion(on);
                  applyReduceMotion(on);
                }}
              />
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
