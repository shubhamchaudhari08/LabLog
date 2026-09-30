/**
 * Buttons (DESIGN.md button-primary / button-secondary / button-secondary-on-dark,
 * plus the button-danger extension). Pass `href` to render a link that looks
 * like a button; everything else is a native <button>.
 */
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'secondary-dark' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  'secondary-dark': 'btn-secondary-dark',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export function buttonClass(
  variant: Variant = 'primary',
  size: 'md' | 'lg' = 'md',
  extra = '',
): string {
  return `${VARIANT[variant]} ${size === 'lg' ? 'h-[52px]' : ''} ${extra}`.trim();
}

interface Style {
  variant?: Variant;
  size?: 'md' | 'lg';
}

export function Button({
  variant,
  size,
  className = '',
  type = 'button',
  ...rest
}: Style & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant,
  size,
  className = '',
  href,
  ...rest
}: Style & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest} />;
}
