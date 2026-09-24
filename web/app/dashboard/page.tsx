'use client';

/**
 * Magic-link landing. Signed out → login; signed in → the running experiment.
 * One workspace screen is the MVP, so there is nothing to choose between.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession, supabase } from '@/lib/supabase';

export default function Dashboard() {
  const router = useRouter();
  const [message, setMessage] = useState('Loading…');

  useEffect(() => {
    void (async () => {
      // Guest mode signs in as the demo account; only a project without demo
      // credentials configured sends the visitor to the login form.
      if (!(await ensureSession())) return router.replace('/login');

      // RUNNING first, then anything still open: an experiment whose protocol is
      // about to be dictated is DRAFT until the first step lands, and it has to
      // be reachable before that.
      const { data: open } = await supabase
        .from('experiments')
        .select('id, status')
        .in('status', ['RUNNING', 'PAUSED', 'READY', 'DRAFT'])
        .order('created_at', { ascending: false });

      const target = open?.find((e) => e.status === 'RUNNING') ?? open?.[0];
      if (target) router.replace(`/dashboard/experiments/${target.id}`);
      else setMessage('No open experiment. Run supabase/seed.sql to reset the demo.');
    })();
  }, [router]);

  return <main className="px-lg py-section text-center text-body-md text-muted">{message}</main>;
}
