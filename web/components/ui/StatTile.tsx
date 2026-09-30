/**
 * A count with a serif numeral (DESIGN.md stat-tile / stat-tile-selected).
 * With `onClick` it is a filter button carrying aria-pressed; with `href` a
 * link; otherwise plain information.
 */
import Link from 'next/link';

export function StatTile({
  label,
  value,
  hint,
  hintClassName = 'text-muted',
  selected = false,
  onClick,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintClassName?: string;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const shell = `card block w-full p-[18px] text-left ${onClick || href ? 'card-lift' : ''} ${
    selected ? 'border-primary bg-surface-white' : ''
  }`;
  const body = (
    <>
      <span className="block text-caption text-body">{label}</span>
      <span
        className={`tabular mt-xs block font-display text-numeral ${selected ? 'text-primary-text' : 'text-ink'}`}
      >
        {value}
      </span>
      {hint && (
        <span className={`mt-xxs flex items-center gap-xxs text-caption ${hintClassName}`}>
          {hint}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={shell}>
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
