/**
 * Per-browser preferences. Conveniences only: nothing here is part of the
 * record, and every read tolerates storage being unavailable.
 */

const REDUCE_MOTION = 'lablog.pref.reduceMotion';

export function readReduceMotion(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION) === '1';
  } catch {
    return false;
  }
}

export function applyReduceMotion(on: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', on);
  try {
    localStorage.setItem(REDUCE_MOTION, on ? '1' : '0');
  } catch {
    /* the class still applies for this visit */
  }
}
