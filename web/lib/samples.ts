/** "A1, A2 A3\nCONTROL-01" → ["A1","A2","A3","CONTROL-01"]. Validation is the server's (api/app/samples.py). */
export function parseSampleCodes(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A sample's type as picked on the New experiment form; '' means not set. */
export type PickedType = '' | 'test' | 'control';

/**
 * The samples part of POST /experiments. With no type picked it is exactly the
 * old request (sample_codes), so the server stores its default type as before;
 * once any type is picked, codes go with their types and unpicked ones omit it.
 * Types are keyed by the uppercased code, as the server stores codes.
 */
export function samplesPayload(
  codes: string[],
  types: Record<string, PickedType>,
): { sample_codes: string[] } | { samples: { code: string; sample_type?: string }[] } {
  const typeOf = (code: string) => types[code.toUpperCase()] || undefined;
  if (!codes.some(typeOf)) return { sample_codes: codes };
  return { samples: codes.map((code) => (typeOf(code) ? { code, sample_type: typeOf(code) } : { code })) };
}
