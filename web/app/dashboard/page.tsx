'use client';

/**
 * Magic-link landing. Signed out → login; signed in → the running experiment.
 * One workspace screen is the MVP, so there is nothing to choose between.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const router = useRouter();
  const [message, setMessage] = useState('Loading…');

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace('/login');

      const { data: running } = await supabase
        .from('experiments')
        .select('id')
        .eq('status', 'RUNNING')
        .order('started_at', { ascending: false })
        .limit(1);

      if (running?.[0]) router.replace(`/dashboard/experiments/${running[0].id}`);
      else setMessage('No running experiment. Run supabase/seed.sql to reset the demo.');
    })();
  }, [router]);

  return <main className="px-lg py-section text-center text-body-md text-muted">{message}</main>;
}
