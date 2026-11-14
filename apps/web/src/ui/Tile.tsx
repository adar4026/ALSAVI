import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * Quick action tile (TASK_036): icon in a circle, label, detail line. Will
 * replace `.quick-action` on the home screen (TASK_039).
 */
export interface TileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  detail?: string;
  /** `accent` (default) or `warm` (difficult words). */
  tone?: 'accent' | 'warm';
}

export function Tile({ icon, label, detail, tone = 'accent', className, type = 'button', ...rest }: TileProps) {
  return (
    <button type={type} className={cx('ui-tile', tone === 'warm' && 'ui-tile--warm', className)} {...rest}>
      <span className="ui-tile-icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="ui-tile-text">
        <span className="ui-tile-label">{label}</span>
        {detail && <span className="ui-tile-detail">{detail}</span>}
      </span>
    </button>
  );
}
