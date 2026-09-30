import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center bg-canvas px-lg">
      <div className="mx-auto w-full max-w-[560px] animate-rise">
        <p className="font-mono text-caption text-muted">404 · not in the record</p>
        <h1 className="mt-xs text-display-lg">That page isn&rsquo;t here</h1>
        <p className="mt-sm max-w-[48ch] text-body-md text-muted">
          The link may be stale, or the experiment may have been reseeded.
        </p>
        <div className="mt-lg flex flex-wrap gap-xs">
          <Link href="/dashboard" className="btn-primary">
            Back to the overview
          </Link>
          <Link href="/experiments" className="btn-ghost">
            Browse experiments
          </Link>
        </div>
      </div>
    </main>
  );
}
