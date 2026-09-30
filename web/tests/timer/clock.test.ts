import { describe, expect, it } from 'vitest';
import { clockOffset, formatCountdown, remainingMs, toLocalMs } from '@/components/timer/clock';

describe('clock', () => {
  it('takes the offset at the midpoint of the round trip', () => {
    const server = '2026-09-26T14:00:00.000Z';
    const serverMs = Date.parse(server);
    // Sent 100 ms before and received 100 ms after the server read its clock.
    expect(clockOffset(server, serverMs - 100, serverMs + 100)).toBe(0);
  });

  it('alarms at the server time when the device clock is 3 minutes fast', () => {
    const server = '2026-09-26T14:00:00.000Z';
    const fastDevice = Date.parse(server) + 3 * 60_000;
    const offset = clockOffset(server, fastDevice, fastDevice);
    expect(offset).toBe(-3 * 60_000);

    const endsAt = '2026-09-26T14:01:00.000Z'; // one minute of server time
    expect(remainingMs(endsAt, offset, fastDevice)).toBe(60_000);
    expect(toLocalMs(endsAt, offset)).toBe(fastDevice + 60_000);
  });

  it('never reports negative time', () => {
    expect(remainingMs('2026-09-26T14:00:00.000Z', 0, Date.parse('2026-09-26T15:00:00.000Z'))).toBe(0);
  });

  it('formats a countdown, rounding up', () => {
    expect(formatCountdown(599_001)).toBe('10:00');
    expect(formatCountdown(599_000)).toBe('9:59');
    expect(formatCountdown(3_900_000)).toBe('1:05:00');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
