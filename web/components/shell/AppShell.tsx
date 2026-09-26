'use client';

/**
 * The frame every signed-in screen sits in: a dark navigation rail on the left
 * and a header that never scrolls away.
 *
 * The rail is dark for the same reason the voice dock is — DESIGN.md reserves
 * dark surfaces for product chrome, and navigation is chrome. The cream field
 * to its right is left for the record itself.
 *
 * The header carries the one thing that must be visible from every screen: the
 * state of the microphone. A session left running on another page is a live
 * microphone the user has forgotten about.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { ensureSession, supabase } from '@/lib/supabase';
import { applyReduceMotion, readReduceMotion } from '@/lib/prefs';
import { useVoiceSession, STATUS_COPY, STATUS_DOT } from '@/components/voice/VoiceSession';
import {
  IconChevron,
  IconChevronsLeft,
  IconClose,
  IconFlask,
  IconGauge,
  IconMenu,
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
  {
    label: 'Quality',
    items: [{ href: '/reliability', label: 'Reliability', icon: IconGauge }],
  },
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

  async function signOut() {
    if (voice.live) voice.disconnect();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <nav
      aria-label="Primary"
      className="sidebar flex h-full flex-col bg-surface-dark text-on-dark-soft"
    >
      <div className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center' : 'px-lg'}`}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="group flex items-center gap-sm"
          aria-label="LabLog overview"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-inset ring-primary/25 transition-transform duration-300 group-hover:rotate-[-8deg]">
            <Logo className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="leading-none">
              <span className="block font-display text-[22px] text-on-dark">LabLog</span>
              <span className="mt-[3px] block text-[11px] tracking-[0.4px] text-on-dark-soft/70">
                Voice notebook
              </span>
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-sm pb-md">
        {NAV.map((group) => (
          <div key={group.label} className="mt-lg first:mt-xs">
            {collapsed ? (
              <div className="mx-auto mb-xs h-px w-6 bg-white/10" aria-hidden />
            ) : (
              <p className="mb-xs px-sm text-[11px] font-medium tracking-[1.2px] text-on-dark-soft/55">
                {group.label}
              </p>
            )}
            <ul className="space-y-[2px]">
              {group.items.map(({ href, label, icon: Glyph, exact }) => {
                const active = isActive(pathname, href, exact);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? label : undefined}
                      className={`side-link ${active ? 'side-link-active' : ''} ${
                        collapsed ? 'justify-center px-0' : ''
                      }`}
                    >
                      <Glyph className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] p-sm">
        <div className={`flex items-center gap-sm rounded-md p-xs ${collapsed ? 'justify-center' : ''}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-teal/15 text-[12px] font-semibold text-accent-teal">
            {initials(user)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-on-dark">
                  {(user?.user_metadata?.display_name as string) || 'Signed in'}
                </span>
                <span className="block truncate text-[11px] text-on-dark-soft/70">
                  {user?.email ?? 'guest session'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="icon-btn-dark"
                aria-label="Sign out"
                title="Sign out"
              >
                <IconSignOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className={`mt-xxs flex w-full items-center gap-sm rounded-md px-sm py-xs text-[12px] text-on-dark-soft/70 transition-colors hover:bg-white/[0.04] hover:text-on-dark ${
              collapsed ? 'justify-center' : ''
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <IconChevronsLeft
              className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            />
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </nav>
  );
}

/** Always-visible microphone state. Links back to the experiment it is bound to. */
function HeaderVoiceChip() {
  const voice = useVoiceSession();
  if (!voice.bound || (!voice.live && voice.status !== 'error')) {
    return (
      <span className="hidden items-center gap-xs rounded-pill border border-hairline bg-canvas px-sm py-[6px] text-caption text-muted-soft md:inline-flex">
        <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-muted-soft/60" />
        Microphone off
      </span>
    );
  }

  return (
    <Link
      href={`/dashboard/experiments/${voice.bound.id}`}
      className="group inline-flex items-center gap-xs rounded-pill border border-primary/25 bg-surface-dark py-[5px] pl-[10px] pr-sm text-caption text-on-dark shadow-panel transition-transform duration-200 hover:-translate-y-px"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {voice.live && (
          <span
            aria-hidden
            className={`absolute inset-0 animate-beacon rounded-pill ${STATUS_DOT[voice.status]}`}
          />
        )}
        <span className={`relative h-2 w-2 rounded-pill ${STATUS_DOT[voice.status]}`} />
      </span>
      <span>{STATUS_COPY[voice.status]}</span>
      <span className="font-mono text-[11px] text-on-dark-soft">{voice.bound.code}</span>
      {voice.muted && <span className="text-[11px] text-accent-amber">muted</span>}
    </Link>
  );
}

function Header({
  crumbs,
  onMenu,
  user,
}: {
  crumbs: Crumb[];
  onMenu: () => void;
  user: User | null;
}) {
  return (
    <header className="app-header">
      <div className="flex h-16 items-center gap-sm px-md lg:px-xl">
        <button type="button" onClick={onMenu} className="icon-btn lg:hidden" aria-label="Open navigation">
          <IconMenu className="h-5 w-5" />
        </button>

        <ol className="flex min-w-0 items-center gap-xxs text-body-sm" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-xxs">
                {i > 0 && <IconChevron className="h-3.5 w-3.5 shrink-0 text-muted-soft" />}
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
          <HeaderVoiceChip />
          <Link
            href="/settings/account"
            className="grid h-9 w-9 place-items-center rounded-md bg-surface-card text-[12px] font-semibold text-ink ring-1 ring-inset ring-hairline transition-colors hover:bg-surface-cream-strong"
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
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable: default to expanded */
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

  return (
    <UserContext.Provider value={user}>
      <CrumbContext.Provider value={setCrumbs}>
        <div
          className="app-frame"
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
              <div className="relative h-full w-[272px] animate-slide-in-left shadow-dark">
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
          </div>
        </div>
      </CrumbContext.Provider>
    </UserContext.Provider>
  );
}
