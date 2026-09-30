'use client';

/**
 * The conversation so far, in the voice dock's expanding sheet.
 *
 * Provisional text sits visibly below the committed turns, so the user can see
 * recognition happening without mistaking it for a record.
 */

import { useEffect, useRef } from 'react';
import type { TranscriptTurn } from '@/lib/voiceClient/types';

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TranscriptPanel({ turns, partial }: { turns: TranscriptTurn[]; partial: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Scroll the transcript box only. scrollIntoView would also drag the page
  // down on every utterance, away from the sample being read.
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [turns.length, partial]);

  return (
    <div ref={boxRef} aria-live="polite" className="max-h-[40vh] min-h-[120px] space-y-sm overflow-y-auto px-[24px] py-md">
      {turns.length === 0 && !partial && (
        <p className="text-body-md text-on-dark-muted">The conversation appears here as you speak.</p>
      )}

      {turns.map((turn) => (
        <div key={turn.id} className={`flex animate-rise ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] rounded-lg px-sm py-xs ${
              turn.role === 'user'
                ? 'bg-dark-raised text-on-dark'
                : 'border border-status-running-border-dark bg-status-running-bg-dark text-status-running-on-dark'
            }`}
          >
            <p className="text-eyebrow uppercase text-on-dark-muted">
              {turn.role === 'user' ? 'You' : 'LabLog'} · {clock(turn.at)}
            </p>
            <p className="mt-[2px] text-body-md">{turn.text}</p>
          </div>
        </div>
      ))}

      {partial && (
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-lg border border-dashed border-dark-border px-sm py-xs text-body-md italic text-on-dark-body">
            {partial}
          </p>
        </div>
      )}
    </div>
  );
}
