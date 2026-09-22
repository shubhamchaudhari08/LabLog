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

  if (!ready) return <p className="px-lg py-section text-center text-body-sm text-muted">Starting…</p>;

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
