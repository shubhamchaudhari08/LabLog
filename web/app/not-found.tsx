import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-lg">
      <p className="text-caption-upper uppercase text-muted-soft">404</p>
      <h1 className="mt-xs text-display-md">That page isn&rsquo;t here</h1>
      <p className="mt-sm max-w-[48ch] text-body-md text-muted">
        The link may be stale, or the experiment may have been reseeded.
      </p>
      <Link href="/dashboard" className="btn-primary mt-lg w-fit">
        Back to the workspace
      </Link>
    </main>
  );
}
