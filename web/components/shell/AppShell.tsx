'use client';

/**
 * The frame every signed-in screen sits in (DESIGN.md sidebar, top-header):
 * an espresso sidebar on the left and a 68px header that never scrolls away.
 *
 * The sidebar carries the agent status card, and the header carries Start
 * voice: a session left running on another page is a live microphone the
 * user has forgotten about, so its state is visible from every screen.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { ensureSession, supabase } from '@/lib/supabase';
import { applyReduceMotion, readReduceMotion } from '@/lib/prefs';
import { useExperimentList } from '@/lib/queries/useExperiment';
import { agentCardView, type AgentCardView } from '@/lib/ui/agentCard';
import { voiceStatusView } from '@/lib/ui/voiceStatus';
import { isBenchPath } from '@/lib/ui/benchMode';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { HeaderTimerChip } from '@/components/timer/TimerChip';
import { CommandBar } from '@/components/ui/CommandBar';
import { StartVoiceButton } from '@/components/ui/StartVoiceButton';
import {
  IconChevron,
  IconChevronsLeft,
  IconClose,
  IconFlask,
  IconGauge,
  IconMenu,
  IconMicOff,
  IconOverview,
  IconProtocol,
  IconRuler,
  IconSignOut,
  IconUser,
  Logo,
} from '@/components/icons';

const NAV = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: IconOverview, exact: true },
      { href: '/experiments', label: 'Experiments', icon: IconFlask },
      { href: '/protocols', label: 'Protocols', icon: IconProtocol },
    ],
  },
  // {
  //   label: 'Quality',
  //   items: [{ href: '/reliability', label: 'Reliability', icon: IconGauge }],
  // },
  {
    label: 'Settings',
    items: [
      { href: '/settings/measurements', label: 'Measurements', icon: IconRuler },
      { href: '/settings/account', label: 'Account', icon: IconUser },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page title context — pages name themselves for the header breadcrumb.
// ---------------------------------------------------------------------------

interface Crumb {
  label: string;
  href?: string;
}

const CrumbContext = createContext<(crumbs: Crumb[]) => void>(() => {});

export function usePageCrumbs(crumbs: Crumb[]) {
  const set = useContext(CrumbContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(JSON.parse(key));
  }, [key, set]);
}

const UserContext = createContext<User | null>(null);
export const useCurrentUser = () => useContext(UserContext);

export function initials(user: User | null): string {
  const name = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? '';
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'LL';
}

// ---------------------------------------------------------------------------

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === '/experiments') {
    return pathname.startsWith('/experiments') || pathname.startsWith('/dashboard/experiments');
  }
  return pathname.startsWith(href);
}

const DOT: Record<AgentCardView['dot'], string> = {
  green: 'bg-status-running-on-dark',
  clay: 'bg-primary-glow',
  grey: 'bg-on-dark-muted',
  amber: 'bg-deviation-on-dark',
  danger: 'bg-danger-on-dark',
};

/** The live agent status card (DESIGN.md agent-status-card). */
function AgentCard({ collapsed }: { collapsed: boolean }) {
  const voice = useVoiceSession();
  const card = agentCardView(voiceStatusView(voice, voice.understoodAt, Date.now()), voice, voice.mic);
  const problem = card.dot === 'danger';
  const dot = (
    <span aria-hidden className="relative flex h-[10px] w-[10px] shrink-0">
      {card.pulse && <span className={`absolute inset-0 animate-pulse-dot rounded-full ${DOT[card.dot]}`} />}
      <span className={`relative h-[10px] w-[10px] rounded-full ${DOT[card.dot]}`} />
    </span>
  );
  const body = collapsed ? (
    <span className="grid h-10 place-items-center" title={`${card.title} · ${card.subtitle}`}>
      {problem ? <IconMicOff className="h-[18px] w-[18px] text-danger-on-dark" /> : dot}
    </span>
  ) : (
    <span className="flex items-start gap-sm">
      <span className="mt-[5px]">{dot}</span>
      <span className="min-w-0">
        <span className={`block truncate text-title-sm ${problem ? 'text-danger-on-dark' : 'text-on-dark-strong'}`}>
          {card.title}
        </span>
        <span className="block truncate text-caption text-sidebar-muted">{card.subtitle}</span>
      </span>
    </span>
  );
  const className = `block w-full rounded-lg border bg-sidebar-card text-left ${collapsed ? '' : 'p-sm'} ${
    problem ? 'border-danger-on-dark/40' : 'border-sidebar-border'
  }`;

  // A tap can fix it: open the browser's microphone prompt from here.
  if (card.requestable) {
    return (
      <button
        type="button"
        onClick={() => void voice.requestMic()}
        className={`${className} transition-colors hover:border-danger-on-dark`}
        aria-live="polite"
        title="Allow the microphone"
      >
        {body}
      </button>
    );
  }
  return card.href ? (
    <Link href={card.href} className={`${className} transition-colors hover:border-dark-border`} aria-live="polite">
      {body}
    </Link>
  ) : (
    <div className={className} aria-live="polite" role={problem ? 'alert' : undefined}>
      {body}
    </div>
  );
}

function Sidebar({
  collapsed,
  onCollapse,
  onNavigate,
  user,
}: {
  collapsed: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
  user: User | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const voice = useVoiceSession();
  const experiments = useExperimentList();
  const liveCount = (experiments.data ?? []).filter((e) => e.status === 'RUNNING').length;

  async function signOut() {
    if (voice.live) voice.disconnect();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <nav
      aria-label="Primary"
      className={`dark-scope flex h-full flex-col bg-sidebar text-sidebar-text ${collapsed ? 'px-[10px]' : 'px-[14px]'} pb-[16px] pt-[20px]`}
    >
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`group flex items-center gap-sm ${collapsed ? 'justify-center' : 'px-[6px]'}`}
        aria-label="LabLog overview"
      >
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-card text-sidebar-icon-active">
          <Logo className="h-[22px] w-[22px]" />
        </span>
        {!collapsed && (
          <span className="leading-none">
            <span className="block font-display text-wordmark text-on-dark">LabLog</span>
            <span className="mt-[3px] block text-caption text-sidebar-muted">Voice notebook</span>
          </span>
        )}
      </Link>

      <div className="mt-lg flex-1 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.label} className="mt-lg first:mt-xs">
            {collapsed ? (
              <div className="mx-auto mb-xs h-px w-6 bg-sidebar-border" aria-hidden />
            ) : (
              <p className="mb-xs px-sm text-eyebrow uppercase text-sidebar-label">{group.label}</p>
            )}
            <ul className="space-y-[2px]">
              {group.items.map(({ href, label, icon: Glyph, exact }) => {
                const active = isActive(pathname, href, exact);
                const badge = href === '/experiments' && liveCount > 0;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? label : undefined}
                      className={`relative flex h-11 items-center gap-sm rounded-md text-nav transition-colors ${
                        collapsed ? 'justify-center px-0' : 'px-sm'
                      } ${
                        active
                          ? 'bg-sidebar-active text-on-dark-strong'
                          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-on-dark'
                      }`}
                    >
                      <Glyph className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sidebar-icon-active' : ''}`} />
                      {!collapsed && <span className="flex-1">{label}</span>}
                      {badge &&
                        (collapsed ? (
                          <span
                            aria-label={`${liveCount} live`}
                            className="absolute right-[6px] top-[6px] h-[7px] w-[7px] rounded-full bg-status-running-on-dark"
                          />
                        ) : (
                          <span className="rounded-pill bg-status-running-bg-dark px-[7px] py-[2px] text-caption text-status-running-on-dark">
                            {liveCount} live
                          </span>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <AgentCard collapsed={collapsed} />

      <div className="mt-md border-t border-sidebar-border pt-md">
        <div className={`flex items-center gap-sm ${collapsed ? 'justify-center' : ''}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-avatar-bg text-caption font-semibold text-avatar-text">
            {initials(user)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-title-sm text-on-dark">
                  {(user?.user_metadata?.display_name as string) || 'Signed in'}
                </span>
                <span className="block truncate text-caption text-sidebar-muted">{user?.email ?? 'guest session'}</span>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="grid h-10 w-10 place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-on-dark"
                aria-label="Sign out"
                title="Sign out"
              >
                <IconSignOut className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className={`mt-xs flex h-10 w-full items-center gap-sm rounded-md px-sm text-caption text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-on-dark ${
              collapsed ? 'justify-center' : ''
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <IconChevronsLeft className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </nav>
  );
}

function Header({ crumbs, onMenu, user }: { crumbs: Crumb[]; onMenu: () => void; user: User | null }) {
  return (
    <header className="sticky top-0 z-header border-b border-hairline bg-canvas">
      <div className="flex h-[68px] items-center gap-sm px-md lg:px-[32px]">
        <button type="button" onClick={onMenu} className="icon-btn -ml-xs lg:hidden" aria-label="Open navigation">
          <IconMenu className="h-5 w-5" />
        </button>

        <ol className="flex min-w-0 items-center gap-xxs text-body-md" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-xxs">
                {i > 0 && <IconChevron className="h-3.5 w-3.5 shrink-0 text-muted" />}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="truncate text-muted transition-colors hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`truncate ${last ? 'font-medium text-ink' : 'text-muted'}`}
                    aria-current={last ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="ml-auto flex items-center gap-sm">
          <HeaderTimerChip />
          <CommandBar />
          <StartVoiceButton />
          <Link
            href="/settings/account"
            className="hidden h-[42px] w-[42px] shrink-0 place-items-center rounded-lg border border-border-control bg-surface-muted-strong text-caption font-semibold text-ink transition-colors hover:border-border-hover sm:grid"
            aria-label="Account settings"
          >
            {initials(user)}
          </Link>
        </div>
      </div>
    </header>
  );
}

const COLLAPSE_KEY = 'lablog.sidebar.collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    // Guest mode signs in as the demo account; only a project without demo
    // credentials configured sends the visitor to the login form.
    void ensureSession().then((session) => {
      if (!session) router.replace('/login');
      else setUser(session.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (readReduceMotion()) applyReduceMotion(true);
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      // Tablet widths start on the icon rail (specs/005 R-521) unless the user chose.
      setCollapsed(stored === null ? window.innerWidth < 1200 : stored === '1');
    } catch {
      setCollapsed(window.innerWidth < 1200);
    }
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, previous ? '0' : '1');
      } catch {
        /* non-essential */
      }
      return !previous;
    });
  }

  // Bench mode is full-screen and dark: no sidebar, header or dock. The providers
  // above stay mounted, so a live session and step timers survive the switch
  // (contracts/ui-routes.md §1).
  if (isBenchPath(pathname)) {
    return (
      <UserContext.Provider value={user}>
        <CrumbContext.Provider value={setCrumbs}>{children}</CrumbContext.Provider>
      </UserContext.Provider>
    );
  }

  return (
    <UserContext.Provider value={user}>
      <CrumbContext.Provider value={setCrumbs}>
        <div
          className="min-h-dvh bg-canvas"
          style={{ '--sidebar-w': collapsed ? '72px' : '248px' } as React.CSSProperties}
        >
          {/* desktop rail */}
          <aside className="fixed inset-y-0 left-0 z-sidebar hidden w-[var(--sidebar-w)] transition-[width] duration-300 ease-out lg:block">
            <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} user={user} />
          </aside>

          {/* mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-overlay lg:hidden" role="dialog" aria-modal aria-label="Navigation">
              <button
                type="button"
                className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
              />
              <div className="relative h-full w-[272px] animate-slide-in-left shadow-dock">
                <Sidebar collapsed={false} onNavigate={() => setDrawer(false)} user={user} />
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  className="icon-btn-dark absolute right-sm top-sm"
                  aria-label="Close navigation"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="min-h-dvh transition-[padding] duration-300 ease-out lg:pl-[var(--sidebar-w)]">
            <Header crumbs={crumbs} onMenu={() => setDrawer(true)} user={user} />
            {children}
            <VoiceDock />
          </div>
        </div>
      </CrumbContext.Provider>
    </UserContext.Provider>
  );
}
