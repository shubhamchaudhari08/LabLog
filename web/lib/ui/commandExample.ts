/**
 * The example phrase in the header command bar (specs/005
 * contracts/ui-voice-surfaces.md §8, DESIGN.md D-9). It must be something the
 * session started from that page can act on.
 */
export function commandExample(
  pathname: string,
  ctx: { firstProtocolCode: string | null; runningCode: string | null },
): string {
  if (/^\/dashboard\/experiments\/[^/]+/.test(pathname)) return 'log pH 7.4 for sample B';
  if (pathname.startsWith('/experiments') && ctx.firstProtocolCode) {
    return `start a new run of ${ctx.firstProtocolCode}`;
  }
  if (!pathname.startsWith('/experiments') && ctx.runningCode) return `resume ${ctx.runningCode}`;
  return 'what protocols can I run?';
}
