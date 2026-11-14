import type { InputHTMLAttributes, Ref } from 'react';
import { cx } from './cx';

/**
 * iOS-style switch on a native checkbox (`role="switch"`), the one from the
 * reminder settings (TASK_034) made shared (TASK_036). Keyboard, screen
 * readers and form semantics stay the browser's own. Label it with a
 * `<label htmlFor>` or `aria-label`.
 */
export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> & { ref?: Ref<HTMLInputElement> };

export function Switch({ className, ref, ...rest }: SwitchProps) {
  return <input ref={ref} type="checkbox" role="switch" className={cx('ui-switch', className)} {...rest} />;
}
