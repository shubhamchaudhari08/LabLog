'use client';

/**
 * The live transcript, shown inside the instrument column.
 *
 * Provisional text sits visibly below the committed turns, so the user can see
 * recognition happening without mistaking it for a record.
 */

import { useEffect, useRef } from 'react';
import type { TranscriptTurn } from '@/lib/voiceClient/types';

export function TranscriptPanel({ turns, partial }: { turns: TranscriptTurn[]; partial: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, partial]);

  return (
    <div className="max-h-[300px] min-h-[200px] space-y-md overflow-y-auto px-lg py-md">
      {turns.length === 0 && !partial && (
        <div className="pt-md">
          <p className="text-body-sm text-on-dark-soft">
            The transcript appears here as you speak.
          </p>
          <ul className="mt-md space-y-xs font-mono text-[13px] text-on-dark-soft/80">
            <li>“A17 is 4.2 Celsius”</li>
            <li>“Note A18 looks slightly cloudy”</li>
            <li>“What&rsquo;s next?”</li>
          </ul>
        </div>
      )}

      {turns.map((turn) => (
        <div key={turn.id} className="animate-rise">
          <p className="text-caption-upper uppercase text-on-dark-soft/70">
            {turn.role === 'user' ? 'you' : 'lablog'}
          </p>
          <p
            className={`mt-xxs text-body-sm ${
              turn.role === 'user' ? 'text-on-dark' : 'text-accent-teal'
            }`}
          >
            {turn.text}
          </p>
        </div>
      ))}

      {/* Provisional text sits visibly below the committed turns, so the user
          can see recognition happening without mistaking it for a record. */}
      {partial && (
        <p className="border-l-2 border-white/10 pl-sm text-body-sm italic text-on-dark-soft">
          {partial}
        </p>
      )}

      <div ref={endRef} />
    </div>
  );
}
