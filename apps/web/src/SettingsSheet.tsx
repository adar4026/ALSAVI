import { useEffect, useRef, type MouseEvent } from 'react';
import { THEME_OPTIONS, type ThemePreference } from './theme';

interface Props {
  open: boolean;
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /** Opens "Карточки" with the import / backup / daily-limit tools expanded. */
  onOpenTools: () => void;
}

/**
 * Settings (TASK_029): the theme choice and a way to the existing collection
 * tools. A native modal `<dialog>` — the browser provides the focus trap,
 * Escape and the backdrop. Becomes the "Профиль" screen in the next stage;
 * until then the tools themselves stay where they are, in "Карточки".
 */
export function SettingsSheet({ open, onClose, theme, onThemeChange, onOpenTools }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // A click on the backdrop lands on the <dialog> itself, not on its content.
  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="settings-title" onClose={onClose} onClick={onBackdropClick}>
      <div className="sheet-body">
        <h2 id="settings-title" className="sheet-title">
          Настройки
        </h2>

        <fieldset className="segmented-field">
          <legend className="field-legend">Тема</legend>
          <div className="segmented">
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className="segmented-option">
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" className="btn-secondary sheet-link" onClick={onOpenTools}>
          Импорт, резервная копия и лимит новых карточек
        </button>

        <button type="button" className="btn-primary" onClick={onClose}>
          Готово
        </button>
      </div>
    </dialog>
  );
}
