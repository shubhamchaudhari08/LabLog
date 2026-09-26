/** "A1, A2 A3\nCONTROL-01" → ["A1","A2","A3","CONTROL-01"]. Validation is the server's (api/app/samples.py). */
export function parseSampleCodes(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}
