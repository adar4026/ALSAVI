import { IconButton } from './IconButton';
import { ProgressBar } from './Progress';

/**
 * Header of a focus mode (TASK_038, COMPONENT_LIBRARY §8): close · progress ·
 * counter, and an optional line under it (the practice says that the
 * schedule does not change). No brand, no navigation — only what the learner
 * needs while recalling.
 */
export interface SessionHeaderProps {
  onClose: () => void;
  /** Accessible name of the close button, e.g. "Завершить повторение". */
  closeLabel: string;
  closeDisabled?: boolean;
  done: number;
  total: number;
  /** Visible counter, e.g. "3 / 12". */
  counter: string;
  /** Short accent line under the header. */
  label?: string;
}

export function SessionHeader({ onClose, closeLabel, closeDisabled, done, total, counter, label }: SessionHeaderProps) {
  return (
    <header className="ui-session-header">
      <div className="ui-session-header-row">
        <IconButton icon="close" label={closeLabel} onClick={onClose} disabled={closeDisabled} />
        <ProgressBar className="ui-session-header-progress" size="sm" value={done} max={total} aria-label="Пройдено карточек" />
        <span className="ui-session-header-count">{counter}</span>
      </div>
      {label && <p className="ui-session-header-label">{label}</p>}
    </header>
  );
}
