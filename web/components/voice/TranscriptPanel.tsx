'use client';

/**
 * The live transcript, shown in the voice dock's sheet.
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
    <div ref={boxRef} className="max-h-[42vh] min-h-[160px] space-y-sm overflow-y-auto px-lg py-md">
      {turns.length === 0 && !partial && (
        <div>
          <p className="text-body-sm text-on-dark-soft">The transcript appears here as you speak. Try:</p>
          <ul className="mt-sm flex flex-wrap gap-xs font-mono text-[13px] text-on-dark">
            <li className="rounded-md bg-white/[0.05] px-sm py-xxs">“A17 is 4.2 Celsius”</li>
            <li className="rounded-md bg-white/[0.05] px-sm py-xxs">“Note A18 looks slightly cloudy”</li>
            <li className="rounded-md bg-white/[0.05] px-sm py-xxs">“What&rsquo;s next?”</li>
          </ul>
        </div>
      )}

      {turns.map((turn) => (
        <div
          key={turn.id}
          className={`flex animate-rise ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-sm py-xs ${
              turn.role === 'user'
                ? 'rounded-br-xs bg-white/[0.07] text-on-dark'
                : 'rounded-bl-xs bg-accent-teal/10 text-accent-teal'
            }`}
          >
            <p className="text-body-sm">{turn.text}</p>
            <p className="mt-[2px] text-[10px] tracking-[0.6px] text-on-dark-soft/60">
              {turn.role === 'user' ? 'You' : 'LabLog'} · {clock(turn.at)}
            </p>
          </div>
        </div>
      ))}

      {partial && (
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-lg border border-dashed border-white/15 px-sm py-xs text-body-sm italic text-on-dark-soft">
            {partial}
          </p>
        </div>
      )}
    </div>
  );
}
