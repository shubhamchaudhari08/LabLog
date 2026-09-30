'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ensureSession } from '@/lib/supabase';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The change stream is the freshness mechanism, not polling.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );
  // Establish the session before anything reads the database, so a direct link
  // to the workspace works as well as landing on the dashboard.
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (pathname === '/login') return setReady(true);
    void ensureSession().finally(() => setReady(true));
  }, [pathname]);

  if (!ready)
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <span className="flex items-center gap-sm text-body-md text-muted">
          <span aria-hidden className="h-2 w-2 rounded-pill bg-primary" />
          Opening your notebook…
        </span>
      </div>
    );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
