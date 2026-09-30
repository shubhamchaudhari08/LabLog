/**
 * The confirm card's "No unit heard" note (specs/005 contracts/ui-voice-surfaces.md §4).
 *
 * Shown only when a unit was stored, the words that produced the reading are
 * known, and those words contain none of the type's unit symbols or spoken
 * forms. Without the words there is no note: we do not claim the user said
 * nothing when we simply do not know what they said.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function unitNote(
  quote: string | null,
  storedUnit: string | null | undefined,
  type: { name?: string; units?: string[]; spoken_units?: string[] } | undefined,
): string | null {
  if (!quote || !storedUnit) return null;
  const forms = [storedUnit, ...(type?.units ?? []), ...(type?.spoken_units ?? [])].filter(Boolean);
  const heard = forms.some((form) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escape(form)}(?![\\p{L}\\p{N}])`, 'iu').test(quote),
  );
  return heard ? null : `No unit heard — used the protocol or starred unit, ${storedUnit}.`;
}
