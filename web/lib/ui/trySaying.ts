/**
 * Overview's "Try saying" phrases (DESIGN.md D-10, FR-511). Overview starts a
 * desk session, which can list protocols and create, start or resume runs,
 * but cannot record a reading, so only those phrases are offered here.
 */
export function trySayingPhrases(ctx: {
  firstProtocolCode: string | null;
  runningCode: string | null;
}): string[] {
  return [
    ctx.firstProtocolCode ? `Start a new run of ${ctx.firstProtocolCode}` : null,
    ctx.runningCode ? `Resume ${ctx.runningCode}` : null,
    'What protocols can I run?',
    'Create an experiment called …',
  ].filter((p): p is string => p !== null);
}
