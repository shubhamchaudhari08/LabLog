/** A toggle (DESIGN.md switch): 52×30, clay when on. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // #cfc5b7 is DESIGN.md switch.trackOff, given as a literal there.
      className={`relative h-[30px] w-[52px] shrink-0 rounded-pill transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-[#cfc5b7]'
      }`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-[24px] w-[24px] rounded-full bg-surface-white shadow-segment transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : ''
        }`}
      />
    </button>
  );
}
