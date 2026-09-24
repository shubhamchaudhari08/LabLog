'use client';

/**
 * Top navigation. Deliberately not a left sidebar: LabLog has one working
 * screen, and a sidebar would spend a fifth of a wall-mounted display on
 * navigation that never changes.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Workspace' },
  { href: '/reliability', label: 'Reliability' },
];

export function TopNav({ status }: { status?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-lg px-lg">
        <Link href="/dashboard" className="flex items-center gap-xs" aria-label="LabLog home">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-ink">
            <svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" aria-hidden>
              <path
                d="M13 7h6v10.5a5 5 0 1 1-6 0V7Z"
                fill="none"
                stroke="#cc785c"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <path d="M13 15.5h6" stroke="#cc785c" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-title-sm text-ink">LabLog</span>
        </Link>

        <div className="ml-md flex items-center gap-xxs">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`nav-link ${active ? 'nav-link-active' : ''}`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-md">
          {status}
          <Link href="/login" className="nav-link">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** Small live-state pill for the nav bar. */
export function SessionPill({ label, tone }: { label: string; tone: 'live' | 'idle' | 'warn' }) {
  const dot =
    tone === 'live'
      ? 'bg-accent-teal animate-pulse-soft'
      : tone === 'warn'
        ? 'bg-accent-amber animate-pulse-soft'
        : 'bg-muted-soft';

  return (
    <span className="hidden items-center gap-xs rounded-pill border border-hairline bg-surface-soft px-sm py-[5px] text-caption text-muted sm:inline-flex">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-pill ${dot}`} />
      {label}
    </span>
  );
}
