import type { ButtonHTMLAttributes, Ref } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * The one button of ALSAVI (TASK_036, COMPONENT_LIBRARY §1). Replaces
 * `.btn-primary`, `.btn-secondary`, `.btn-link`, `.btn-danger`, `.btn-cta`.
 *
 * - `primary` — the one main action of a screen;
 * - `secondary` — soft accent fill, for second actions;
 * - `tertiary` — text button (former links);
 * - `destructive` — soft red, for a destructive action at rest;
 * - `danger` — filled red, only to confirm a destructive action.
 *
 * A native `<button>` (default `type="button"`), so Enter/Space activate it
 * natively — the study session's hotkeys leave focused buttons alone
 * (`review-hotkeys.ts`, TASK_025).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `md` — 44 px, `lg` — 52 px. */
  size?: ButtonSize;
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label (e.g. an arrow). */
  iconEnd?: IconName;
  /** Shows a spinner instead of the icon and disables the button. */
  loading?: boolean;
  /** Full width of the container. */
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'lg' ? 22 : 20;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        block && 'ui-button--block',
        loading && 'is-loading',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconEnd && !loading && <Icon name={iconEnd} size={iconSize} />}
    </button>
  );
}
