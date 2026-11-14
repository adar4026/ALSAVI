import type { ButtonHTMLAttributes, Ref } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * Icon-only button (TASK_036), 44 × 44 touch area. Replaces `.icon-button`
 * and `.btn-icon`. The visible icon has no text, so `label` is required — it
 * becomes the accessible name.
 */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName;
  label: string;
  /** `plain` — transparent; `filled` — a raised surface; `accent` — accent fill. */
  variant?: 'plain' | 'filled' | 'accent';
  iconSize?: number;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  variant = 'plain',
  iconSize = 22,
  className,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-icon-button', `ui-icon-button--${variant}`, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
