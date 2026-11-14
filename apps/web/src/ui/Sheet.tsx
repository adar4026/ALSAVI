import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { keyboardInset } from './keyboard-inset';
import type { CloseReason } from './sheet-state';
import { ToastHost } from './Toast';
import { cx } from './cx';

/**
 * Keeps a native `<dialog>` in step with `open` (TASK_036). `showModal()`
 * gives the focus trap and the inert page for free. Escape arrives as the
 * `cancel` event, which the components cancel and route to the caller — but a
 * browser may close the dialog anyway (Chrome lets a page cancel Escape only
 * after a user activation). So a native `close` while `open` is still true is
 * reported as `onNativeClose` and the dialog is shown again if the caller
 * keeps it open (e.g. a sheet that first asks "Отменить изменения?").
 * Focus returns to the element that had it before opening.
 */
function useModal(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  { initialFocus, onNativeClose }: { initialFocus?: RefObject<HTMLElement | null>; onNativeClose?: () => void } = {}
): (e: SyntheticEvent<HTMLDialogElement>) => void {
  const returnTo = useRef<HTMLElement | null>(null);
  // Set while an Escape was already reported through `cancel`, so the native
  // `close` that may follow it does not report it a second time.
  const reported = useRef(false);
  const openRef = useRef(open);
  const onNativeCloseRef = useRef(onNativeClose);
  const [resync, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    openRef.current = open;
    onNativeCloseRef.current = onNativeClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (!returnTo.current) {
        returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      dialog.showModal();
      initialFocus?.current?.focus();
    } else if (!open) {
      if (dialog.open) dialog.close();
      restoreFocus(returnTo.current);
      returnTo.current = null;
    }
  }, [ref, open, initialFocus, resync]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClose = () => {
      if (!openRef.current) return; // our own close()
      if (!reported.current) onNativeCloseRef.current?.();
      reported.current = false;
      bump();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [ref]);

  // Unmounted while open: put focus back too.
  useEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
      restoreFocus(returnTo.current);
    },
    [ref]
  );

  // `cancel` (Escape): keep the dialog open when the browser allows it and
  // report the request once.
  return (e) => {
    e.preventDefault();
    reported.current = true;
    setTimeout(() => {
      reported.current = false;
    }, 0);
    onNativeCloseRef.current?.();
  };
}

/**
 * Put focus back after a dialog closed. Deferred one task: when a sheet and
 * its confirmation close together, the browser's own focus fix-up for the
 * second dialog must not overwrite it. Skipped when the element is gone or
 * sits inside a dialog that is now closed.
 */
function restoreFocus(el: HTMLElement | null) {
  if (!el) return;
  setTimeout(() => {
    if (el.isConnected && !el.closest('dialog:not([open])')) el.focus();
  }, 0);
}

/**
 * The height the on-screen keyboard covers while `active` (TASK_040), from
 * `visualViewport` — 0 without a keyboard or where the API is missing.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () =>
      setInset(keyboardInset({ layoutHeight: window.innerHeight, visualHeight: vv.height, visualOffsetTop: vv.offsetTop }));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}

/** A click on the backdrop lands on the dialog element itself, outside its box. */
function isBackdropClick(e: MouseEvent<HTMLDialogElement>): boolean {
  if (e.target !== e.currentTarget) return false;
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/**
 * Bottom sheet (TASK_036, COMPONENT_LIBRARY §5): slides up on phones, a
 * centred 560 px window on wide screens. Header: `leading` action (usually
 * "Отмена"), the title, `trailing` action ("Готово"); `footer` is the action
 * dock pinned to the bottom of the sheet. Whether closing is allowed is the
 * caller's decision (`SheetController`, `sheet-state.ts`).
 */
export interface SheetProps {
  open: boolean;
  title: string;
  onRequestClose: (reason: CloseReason) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, title, onRequestClose, leading, trailing, footer, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The sheet rises above the on-screen keyboard, so its action stays visible.
  const inset = useKeyboardInset(open);
  const onCancel = useModal(ref, open, { onNativeClose: () => onRequestClose('escape') });
  return (
    <dialog
      ref={ref}
      className={cx('ui-sheet', inset > 0 && 'ui-sheet--keyboard', className)}
      aria-labelledby={titleId}
      style={{ '--keyboard-inset': `${inset}px` } as CSSProperties}
      onCancel={onCancel}
      onClick={(e) => {
        if (isBackdropClick(e)) onRequestClose('backdrop');
      }}
    >
      {open && (
        <div className="ui-sheet-frame">
          <span className="ui-sheet-handle" aria-hidden="true" />
          <header className="ui-sheet-head">
            <span className="ui-sheet-side">{leading}</span>
            <h2 id={titleId} className="ui-sheet-title">
              {title}
            </h2>
            <span className="ui-sheet-side ui-sheet-side--end">{trailing}</span>
          </header>
          <div className="ui-sheet-body">{children}</div>
          {footer && <div className="ui-sheet-footer">{footer}</div>}
          {/* Toasts about the sheet's own actions ("Добавлено · Открыть") must
              be reachable: the page behind a modal dialog is inert. */}
          <ToastHost placement="sheet" />
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmation dialog (TASK_036): title, one sentence, "Отмена" + the action.
 * Focus starts on the safe choice ("Отмена"), as the inline archive
 * confirmation did (TASK_023); Escape and the backdrop cancel.
 */
export interface DialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Filled red confirm button (`--danger-fill`). */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content under the message, e.g. an error of the last attempt. */
  children?: ReactNode;
}

export function Dialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const onEscape = useModal(ref, open, {
    initialFocus: cancelRef,
    onNativeClose: () => {
      if (!busy) onCancel();
    },
  });
  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={onEscape}
      onClick={(e) => {
        if (!busy && isBackdropClick(e)) onCancel();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="ui-dialog-title">
            {title}
          </h2>
          <div id={messageId} className="ui-dialog-message">
            {message}
          </div>
          {children}
          <div className="ui-dialog-actions">
            <button ref={cancelRef} type="button" className="ui-button ui-button--secondary ui-button--md" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={cx('ui-button', destructive ? 'ui-button--danger' : 'ui-button--primary', 'ui-button--md')}
              onClick={onConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
