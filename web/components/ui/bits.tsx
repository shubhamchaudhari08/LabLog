/**
 * Small presentational pieces from DESIGN.md: lock-pill, unit-chip,
 * unit-chip-default, the icon tile used by protocol and measurement rows,
 * and the eyebrow.
 */
import { IconLock } from '@/components/icons';

export function LockPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-surface-muted px-[10px] py-[5px] text-caption text-body">
      <IconLock className="h-[14px] w-[14px]" />
      {children}
    </span>
  );
}

export function UnitChip({ unit, isDefault = false }: { unit: string; isDefault?: boolean }) {
  // The hex literals are DESIGN.md's unit-chip / unit-chip-default values.
  return (
    <span
      className={`inline-flex h-[28px] items-center gap-[4px] rounded-sm border px-[8px] font-mono text-code ${
        isDefault
          ? 'border-[#ebc6b6] bg-primary-tint-soft text-primary-text'
          : 'border-[#e7dfd3] bg-[#f4efe7] text-[#3d3832]'
      }`}
    >
      {isDefault && <span aria-label="default">★</span>}
      {unit}
    </span>
  );
}

const TILE_TONE = {
  tint: 'bg-primary-tint text-primary-text',
  clay: 'bg-primary text-on-primary',
  muted: 'bg-surface-muted text-body',
  dark: 'bg-sidebar text-primary-on-dark',
} as const;

export function IconTile({
  tone = 'tint',
  size = 38,
  className = '',
  children,
}: {
  tone?: keyof typeof TILE_TONE;
  size?: 38 | 44;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-md ${TILE_TONE[tone]} ${
        size === 44 ? 'h-[44px] w-[44px]' : 'h-[38px] w-[38px]'
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Eyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}
