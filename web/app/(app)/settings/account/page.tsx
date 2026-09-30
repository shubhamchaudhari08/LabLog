'use client';

/**
 * Account (specs/005 US4, PDF frame 6; DESIGN.md account-card): who is signed
 * in, the name the agent greets you with, and per-browser preferences.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { initials, useCurrentUser, usePageCrumbs } from '@/components/shell/AppShell';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { IconSignOut } from '@/components/icons';
import { Switch } from '@/components/ui/Switch';
import { Waveform } from '@/components/ui/voiceVisuals';
import { supabase } from '@/lib/supabase';
import { applyReduceMotion, readReduceMotion } from '@/lib/prefs';

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-md border-t border-hairline px-lg py-[28px] sm:px-[30px] md:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="font-sans text-title-md text-ink">{title}</h2>
        <p className="mt-xxs text-body-md text-body">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const SAVED_VISIBLE_MS = 2000;

export default function AccountSettings() {
  usePageCrumbs([{ label: 'Settings' }, { label: 'Account' }]);
  const user = useCurrentUser();
  const router = useRouter();
  const voice = useVoiceSession();

  const current = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => setName(current), [current]);
  useEffect(() => setReduceMotion(readReduceMotion()), []);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), SAVED_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [saved]);

  const unchanged = name.trim() === current.trim();

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { error: failure } = await supabase.auth.updateUser({ data: { display_name: name.trim() || null } });
    setSaving(false);
    if (failure) setError(failure.message);
    else setSaved(true);
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
    <main id="main" className="page max-w-[1016px]">
      <header className="animate-rise">
        <p className="eyebrow">Settings</p>
        <h1 className="page-title mt-xs">Account</h1>
      </header>

      <div className="mt-lg animate-slide-up overflow-hidden rounded-feature border border-hairline bg-surface-card">
        <div className="flex flex-wrap items-center gap-lg px-lg py-[26px] sm:px-[30px]">
          <span className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-xl bg-sidebar font-display text-[34px] text-primary-on-dark">
            {initials(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-lg text-ink">{current || 'No name set'}</p>
            <p className="truncate text-body-md text-body">{user?.email ?? 'Loading…'}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void signOut()}>
            <IconSignOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <Section title="Profile" hint="User details">
          <form onSubmit={saveName} className="max-w-[460px]">
            <label htmlFor="display-name" className="text-body-md text-body">
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
              <button type="submit" className="btn-primary h-[44px] shrink-0" disabled={saving || !user || unchanged}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="mt-xs text-caption" role="status">
              {error ? (
                <span className="text-danger-text">{error}</span>
              ) : saved ? (
                <span className="font-semibold text-status-running-text">Saved</span>
              ) : (
                <span className="text-muted">The agent greets you with this name.</span>
              )}
            </p>
          </form>
        </Section>

        <Section title="Sign-in" hint="Authentication details">
          <dl className="grid max-w-[520px] grid-cols-[140px_minmax(0,1fr)] gap-y-sm text-body-md">
            <dt className="text-body">Email</dt>
            <dd className="truncate text-ink">{user?.email ?? '—'}</dd>
            <dt className="text-body">Member since</dt>
            <dd className="text-ink">{created}</dd>
          </dl>
        </Section>

        <Section title="Preferences" hint="Stored for this browser.">
          <div className="flex max-w-[560px] items-center gap-md rounded-lg bg-primary-tint-faint p-[14px]">
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-lg bg-sidebar">
              <Waveform bars={7} running={!reduceMotion} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-title-sm text-ink">Reduce motion</p>
              <p className="mt-[2px] text-caption text-body">Turns off step transitions, pulses and the listening animation.</p>
            </div>
            <Switch
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
    </main>
  );
}
