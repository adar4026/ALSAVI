import { useSyncExternalStore } from 'react';
import { toasts as appToasts, type ToastQueue } from './toast-queue';

/**
 * Renders the current toast of a queue (TASK_036): inverted pill above the
 * navigation, one line of text and at most one action. `role="status"` —
 * errors are Banners, not toasts. The countdown pauses while the toast is
 * hovered or holds focus. Mount one `ToastHost` per app (the shell, TASK_037+).
 */
export function ToastHost({ queue = appToasts, placement = 'nav' }: { queue?: ToastQueue; placement?: 'nav' | 'dock' | 'inline' }) {
  const { current } = useSyncExternalStore(queue.subscribe, queue.getState);
  return (
    <div className={`ui-toast-host ui-toast-host--${placement}`} role="status" aria-live="polite">
      {current && (
        <div
          key={current.id}
          className="ui-toast"
          onMouseEnter={() => queue.pause()}
          onMouseLeave={() => queue.resume()}
          onFocus={() => queue.pause()}
          onBlur={() => queue.resume()}
        >
          <span className="ui-toast-text">{current.message}</span>
          {current.action && (
            <button type="button" className="ui-toast-action" onClick={() => queue.act()}>
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
