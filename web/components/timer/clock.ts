/**
 * Server-clock arithmetic for step timers (specs/004-step-timers research R-307).
 *
 * The countdown follows the server's clock, not the device's: every status
 * response carries `server_now`, and the offset is taken at the midpoint of the
 * round trip. A device a few minutes off still alarms at the right moment.
 */

/** Milliseconds to add to the device clock to get the server clock. */
export function clockOffset(serverNowIso: string, sentAtMs: number, receivedAtMs: number): number {
  return Date.parse(serverNowIso) - (sentAtMs + receivedAtMs) / 2;
}

/** The device-clock instant at which a server-clock time falls. */
export function toLocalMs(serverIso: string, offsetMs: number): number {
  return Date.parse(serverIso) - offsetMs;
}

export function remainingMs(endsAtIso: string, offsetMs: number, nowMs = Date.now()): number {
  return Math.max(0, toLocalMs(endsAtIso, offsetMs) - nowMs);
}

/** "9:59", "1:05:00". Rounds up, so the display reads 0:00 only at zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}
