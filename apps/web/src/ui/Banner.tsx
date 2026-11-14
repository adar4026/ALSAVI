import type { AriaRole, ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * In-flow message (TASK_036): errors, warnings, information that stays on the
 * screen. Replaces `.notice` (+ `-info/-warning/-error`), `.save-error` and
 * the update banner. Success that needs no decision goes to a Toast.
 *
 * `role`: an error defaults to `alert` (announced at once); other tones have
 * no role unless the caller gives one (`status`) — so a banner inside an
 * existing live region is not announced twice.
 */
export type BannerTone = 'info' | 'warning' | 'error' | 'success';

const ICONS: Record<BannerTone, IconName> = { info: 'info', warning: 'info', error: 'info', success: 'check' };

export interface BannerProps {
  tone?: BannerTone;
  children: ReactNode;
  /** Up to two actions (buttons), shown after the text. */
  actions?: ReactNode;
  role?: AriaRole;
  /** Hide the leading icon (e.g. a banner that carries its own heading). */
  plain?: boolean;
  className?: string;
}

export function Banner({ tone = 'info', children, actions, role, plain = false, className }: BannerProps) {
  return (
    <div className={cx('ui-banner', `ui-banner--${tone}`, className)} role={role ?? (tone === 'error' ? 'alert' : undefined)}>
      {!plain && (
        <span className="ui-banner-icon" aria-hidden="true">
          <Icon name={ICONS[tone]} size={20} />
        </span>
      )}
      <div className="ui-banner-text">{children}</div>
      {actions && <div className="ui-banner-actions">{actions}</div>}
    </div>
  );
}
