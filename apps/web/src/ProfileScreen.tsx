import type { EngineStore, LearningEngine } from '@alsavi/engine';
import { backupFilename, createBackup, restoreBackup } from '@alsavi/backup';
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { exportedStatus, restoreConfirmText, restoredStatus } from './backup-messages';
import { importApkgFile, type ImportReport } from './importApkg';
import type { Platform } from './reminder-browser';
import type { ReminderClient } from './reminder-client';
import { RemindersSection } from './RemindersSection';
import { THEME_OPTIONS, type ThemePreference } from './theme';

const SKIP_LABELS: Record<string, string> = {
  'cloze-note-type': 'cloze',
  'fewer-than-2-fields': 'меньше 2 полей',
  'unsupported-template': 'неподдерживаемый шаблон',
  'empty-after-cleanup': 'пустой текст',
};

function describeReport(r: ImportReport): string {
  const skipped = r.skipped.reduce((n, s) => n + s.count, 0);
  let msg = `Импортировано ${r.importedNotes} заметок (${r.importedCards} карточек).`;
  if (skipped > 0) {
    const parts = r.skipped.map((s) => `${SKIP_LABELS[s.reason] ?? s.reason} — ${s.count}`);
    msg += ` Пропущено ${skipped}: ${parts.join(', ')}.`;
  }
  if (r.error) msg += ` Прервано с ошибкой: ${r.error}`;
  return msg;
}

/** `null` -> empty (unlimited); a number -> its decimal string. */
function formatLimit(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Empty/invalid/negative input -> unlimited (`null`); otherwise a non-negative integer. */
function parseLimit(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

interface Props {
  engine: LearningEngine;
  store: EngineStore;
  /** After an import or a restore changed the collection. */
  onChanged: () => void;
  /** Current daily new-card limit (`null` = unlimited). Owned by `App`. */
  newCardsPerDay: number | null;
  /**
   * The stored limit has been loaded (bootstrap 'ready'). Until then the
   * field is disabled: an empty field means "unlimited", and committing it
   * before the real value arrived would overwrite the stored limit.
   */
  limitReady: boolean;
  /** Persist + apply a new daily new-card limit. Owned by `App`. */
  onLimitChange: (value: number | null) => void;
  /** A save is in flight — the control is disabled to prevent overlapping saves. */
  limitSaving: boolean;
  /** Set only when the most recent save attempt failed; cleared on the next attempt. */
  limitSaveError: string | null;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  /** Review reminders (TASK_034). */
  reminders: ReminderClient;
  platform: Platform;
  /** Bumped when the app returns to the foreground. */
  refreshKey: number;
}

/**
 * "Профиль" (TASK_030): the learner's settings and data in one place — the
 * daily new-card limit, review reminders (TASK_034), the theme, Anki import
 * and backup/restore. There are
 * no accounts: everything lives on this device. The import/backup/limit code
 * and texts moved here unchanged from the "Карточки" tools block (TASK_023);
 * the limit's validation and persistence stay in `App` (TASK_020).
 */
export function ProfileScreen({
  engine,
  store,
  onChanged,
  newCardsPerDay,
  limitReady,
  onLimitChange,
  limitSaving,
  limitSaveError,
  theme,
  onThemeChange,
  reminders,
  platform,
  refreshKey,
}: Props) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState(() => formatLimit(newCardsPerDay));
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const limitId = useId();

  useEffect(() => {
    setLimitInput(formatLimit(newCardsPerDay));
  }, [newCardsPerDay]);

  function commitLimit() {
    const parsed = parseLimit(limitInput);
    setLimitInput(formatLimit(parsed));
    onLimitChange(parsed);
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setImportStatus(`Импорт «${file.name}»…`);
    try {
      const report = await importApkgFile(file, engine);
      setImportStatus(describeReport(report));
      onChanged();
    } catch (err) {
      setImportStatus(`Не удалось импортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onExport() {
    setBackupStatus('Формирую резервную копию…');
    try {
      const { json, retired } = await createBackup(store);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus(exportedStatus(retired));
    } catch (err) {
      setBackupStatus(`Не удалось экспортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupStatus(null);
    try {
      const text = await file.text();
      // What the restore would replace — named in the confirmation (TASK_033).
      const [notes, cards, reviews] = await Promise.all([store.listNotes(), store.listCards(), store.listReviews()]);
      const current = { notes: notes.length, cards: cards.length, reviews: reviews.length };
      // restoreBackup owns validate → confirm → replace; this callback is
      // only the UI's confirmation policy (window.confirm), given the parsed
      // metadata — no parsing/replace logic lives here.
      const outcome = await restoreBackup(store, text, (meta) => window.confirm(restoreConfirmText(meta, current)));
      switch (outcome.status) {
        case 'rejected':
          setBackupStatus(`Файл отклонён: ${outcome.error} Текущие данные не изменены.`);
          return;
        case 'cancelled':
          setBackupStatus('Восстановление отменено. Данные не изменены.');
          return;
        case 'restored':
          setBackupStatus(restoredStatus(outcome));
          onChanged();
          return;
      }
    } catch (err) {
      setBackupStatus(`Ошибка восстановления: ${err instanceof Error ? err.message : String(err)}. Данные могли не измениться.`);
    }
  }

  return (
    <div className="profile-screen">
      <div className="profile-head">
        <h1 className="profile-title">Профиль</h1>
        <p className="profile-lead">Аккаунта нет: все карточки и история хранятся только на этом устройстве.</p>
      </div>

      <ProfileSection id="profile-study" title="Обучение">
        <div className="setting-row">
          <label htmlFor={limitId} className="setting-label">
            Новых карточек в день
            <span className="setting-hint">Пусто — без ограничения.</span>
          </label>
          <input
            id={limitId}
            className="limit-input"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="∞"
            value={limitInput}
            disabled={limitSaving || !limitReady}
            onChange={(e) => setLimitInput(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </div>
        {limitSaving && <p className="import-status">Сохранение…</p>}
        {limitSaveError && (
          <p className="import-status" role="alert">
            {limitSaveError}
          </p>
        )}
      </ProfileSection>

      <RemindersSection client={reminders} platform={platform} refreshKey={refreshKey} />

      <ProfileSection id="profile-look" title="Оформление">
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
      </ProfileSection>

      <ProfileSection id="profile-data" title="Данные">
        <div className="data-group">
          <input
            ref={fileInput}
            type="file"
            accept=".apkg"
            style={{ display: 'none' }}
            onChange={(e) => void onImport(e)}
          />
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
            Импорт из Anki (.apkg)
          </button>
          {importStatus && (
            <p className="import-status" role="status">
              {importStatus}
            </p>
          )}
        </div>
        <div className="data-group">
          <input
            ref={backupInput}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => void onRestore(e)}
          />
          <div className="data-actions">
            <button type="button" className="btn-secondary" onClick={() => void onExport()}>
              Экспорт (резервная копия)
            </button>
            <button type="button" className="btn-secondary" onClick={() => backupInput.current?.click()}>
              Восстановить из копии
            </button>
          </div>
          {backupStatus && (
            <p className="import-status" role="status">
              {backupStatus}
            </p>
          )}
          <p className="hint">Резервная копия — один файл со всеми карточками и историей повторений.</p>
        </div>
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="panel profile-section" aria-labelledby={id}>
      <h2 id={id} className="panel-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
