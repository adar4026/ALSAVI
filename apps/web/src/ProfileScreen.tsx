import type { EngineStore, LearningEngine } from '@alsavi/engine';
import { backupFilename, createBackup, restoreBackup } from '@alsavi/backup';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { exportedStatus, restoreConfirmText, restoredStatus } from './backup-messages';
import { Icon } from './Icon';
import {
  describeImport,
  LIMIT_BOUNDS,
  LIMIT_SAVE_DELAY_MS,
  limitAfterUnlimitedToggle,
  limitStatusText,
  THEME_CHOICES,
} from './profile-view';
import type { Platform } from './reminder-browser';
import type { ReminderClient } from './reminder-client';
import { RemindersSection } from './RemindersSection';
import { SettingRow } from './SettingRow';
import type { ThemePreference } from './theme';
import { Banner, GroupedList, ListRow, ScreenHeader, SegmentedControl, Stepper, Switch, toasts, type BannerTone } from './ui';

interface Props {
  engine: LearningEngine;
  store: EngineStore;
  /** After an import or a restore changed the collection. */
  onChanged: () => void;
  /** Current daily new-card limit (`null` = unlimited). Owned by `App`. */
  newCardsPerDay: number | null;
  /**
   * The stored limit has been loaded (bootstrap 'ready'). Until then the
   * controls are disabled: changing them before the real value arrived
   * would overwrite the stored limit.
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
 * "Профиль" (TASK_030, grouped settings since TASK_043): «Обучение» (the daily
 * new-card limit), «Напоминания» (TASK_034), «Оформление», «Данные» (backup,
 * restore, Anki import) and «О приложении». No accounts: everything lives on
 * this device. The limit's validation and saving stay in `App` (TASK_020) —
 * the value on screen changes only after a successful write; reminders keep
 * their client; backup texts are `backup-messages.ts`. Successes are toasts,
 * problems (and long results) are banners.
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
  return (
    <div className="profile-screen">
      <ScreenHeader title="Профиль" subtitle="Аккаунта нет — всё хранится на этом устройстве." />
      <div className="profile-columns">
        <div className="profile-column">
          <LimitGroup
            value={newCardsPerDay}
            ready={limitReady}
            onChange={onLimitChange}
            saving={limitSaving}
            error={limitSaveError}
          />
          <RemindersSection client={reminders} platform={platform} refreshKey={refreshKey} />
        </div>
        <div className="profile-column">
          <GroupedList title="Оформление">
            <SettingRow
              title="Тема"
              className="setting-row--wide"
              control={
                <SegmentedControl
                  legend="Тема"
                  legendHidden
                  name="theme"
                  fill={false}
                  options={THEME_CHOICES}
                  value={theme}
                  onChange={onThemeChange}
                />
              }
            />
          </GroupedList>
          <DataGroup engine={engine} store={store} onChanged={onChanged} />
          <GroupedList title="О приложении">
            <SettingRow title="ALSAVI" hint="Изучение испанского с интервальными повторениями" />
            <SettingRow title="Данные" control={<span className="setting-value">на этом устройстве</span>} />
          </GroupedList>
        </div>
      </div>
    </div>
  );
}

/**
 * «Обучение»: the daily new-card limit as a stepper plus «Без ограничения».
 * A stepper change is saved once it settles (600 ms); the switch at once.
 * `App` validates, writes, then applies — a failed write leaves the stored
 * value and puts the stepper back to it.
 */
function LimitGroup({
  value,
  ready,
  onChange,
  saving,
  error,
}: {
  value: number | null;
  ready: boolean;
  onChange: (value: number | null) => void;
  saving: boolean;
  error: string | null;
}) {
  const unlimitedId = useId();
  const [draft, setDraft] = useState(() => value ?? limitAfterUnlimitedToggle(false, null)!);
  const lastNumber = useRef<number | null>(value);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; value: number } | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  // The saved value is the truth: after a save (or a failed one) show it.
  useEffect(() => {
    if (value !== null) {
      setDraft(value);
      lastNumber.current = value;
    }
  }, [value, error]);

  // "Сохранено" for 1.5 s after a save that went through.
  const [savedRecently, setSavedRecently] = useState(false);
  const wasSaving = useRef(saving);
  useEffect(() => {
    if (wasSaving.current && !saving && !error) {
      setSavedRecently(true);
      const t = setTimeout(() => setSavedRecently(false), 1500);
      wasSaving.current = saving;
      return () => clearTimeout(t);
    }
    wasSaving.current = saving;
  }, [saving, error]);

  // Leaving the screen within the delay still saves the chosen number.
  useEffect(
    () => () => {
      const p = pending.current;
      if (!p) return;
      clearTimeout(p.timer);
      if (p.value !== valueRef.current) onChangeRef.current(p.value);
    },
    []
  );

  function onStep(next: number) {
    setDraft(next);
    setSavedRecently(false);
    if (pending.current) clearTimeout(pending.current.timer);
    const timer = setTimeout(() => {
      pending.current = null;
      if (next !== valueRef.current) onChangeRef.current(next);
    }, LIMIT_SAVE_DELAY_MS);
    pending.current = { timer, value: next };
  }

  function onUnlimited(on: boolean) {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    setSavedRecently(false);
    onChange(limitAfterUnlimitedToggle(on, lastNumber.current ?? draft));
  }

  const unlimited = value === null;
  const status = limitStatusText({ saving, error, savedRecently });

  return (
    <div className="profile-group">
      <GroupedList title="Обучение" note="Сколько новых слов появляется в очереди за день.">
        <SettingRow
          title="Новых карточек в день"
          hint={unlimited ? 'без ограничения' : undefined}
          control={
            <Stepper
              label="Новых карточек в день"
              value={draft}
              {...LIMIT_BOUNDS}
              disabled={!ready || unlimited || saving}
              onChange={onStep}
            />
          }
        />
        <SettingRow
          title="Без ограничения"
          htmlFor={unlimitedId}
          control={
            <Switch
              id={unlimitedId}
              checked={unlimited}
              disabled={!ready || saving}
              onChange={(e) => onUnlimited(e.target.checked)}
            />
          }
        />
      </GroupedList>
      <p className={error ? 'setting-status is-error' : 'setting-status'} role={error ? 'alert' : 'status'}>
        {status}
      </p>
    </div>
  );
}

/** A finished data operation: a short success is a toast, the rest a banner. */
type DataResult = { tone: BannerTone; text: string } | null;

/** «Данные»: backup export, restore from a copy, Anki import — logic and texts as before (TASK_011/027/033). */
function DataGroup({ engine, store, onChanged }: { engine: LearningEngine; store: EngineStore; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<DataResult>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  function finish(tone: BannerTone, text: string, short = false) {
    setBusy(null);
    if (tone === 'success' && short) {
      setResult(null);
      toasts.show({ message: text });
    } else {
      setResult({ tone, text });
    }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setResult(null);
    setBusy(`Импорт «${file.name}»…`);
    try {
      // Loaded on demand (TASK_041): the Anki reader and sql.js are needed only
      // here and kept out of the main bundle; the chunk is precached like the
      // rest of dist/, so import still works offline.
      const { importApkgFile } = await import('./importApkg');
      const report = await importApkgFile(file, engine);
      const { text, tone } = describeImport(report);
      finish(tone, text, report.skipped.length === 0);
      onChanged();
    } catch (err) {
      finish('error', `Не удалось импортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onExport() {
    setResult(null);
    setBusy('Формирую резервную копию…');
    try {
      const { json, retired } = await createBackup(store);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      a.click();
      URL.revokeObjectURL(url);
      finish('success', exportedStatus(retired), !retired);
    } catch (err) {
      finish('error', `Не удалось экспортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResult(null);
    setBusy('Восстановление…');
    try {
      const text = await file.text();
      // What the restore would replace — named in the confirmation (TASK_033).
      const [notes, cards, reviews] = await Promise.all([store.listNotes(), store.listCards(), store.listReviews()]);
      const current = { notes: notes.length, cards: cards.length, reviews: reviews.length };
      // restoreBackup owns validate → confirm → replace; this callback is
      // only the UI's confirmation policy (window.confirm, D-18), given the
      // parsed metadata — no parsing/replace logic lives here.
      const outcome = await restoreBackup(store, text, (meta) => window.confirm(restoreConfirmText(meta, current)));
      switch (outcome.status) {
        case 'rejected':
          finish('error', `Файл отклонён: ${outcome.error} Текущие данные не изменены.`);
          return;
        case 'cancelled':
          finish('info', 'Восстановление отменено. Данные не изменены.');
          return;
        case 'restored':
          finish('success', restoredStatus(outcome), !outcome.retired);
          onChanged();
          return;
      }
    } catch (err) {
      finish('error', `Ошибка восстановления: ${err instanceof Error ? err.message : String(err)}. Данные могли не измениться.`);
    }
  }

  const run = (action: () => void) => () => {
    if (!busy) action();
  };

  return (
    <div className="profile-group">
      <input ref={fileInput} type="file" accept=".apkg" hidden onChange={(e) => void onImport(e)} />
      <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => void onRestore(e)} />
      <GroupedList title="Данные" note="Резервная копия — один файл со всеми словами и историей повторений.">
        <ListRow
          leading={<Icon name="download" size={22} />}
          title="Экспорт резервной копии"
          chevron
          className="setting-row"
          onClick={run(() => void onExport())}
        />
        <ListRow
          leading={<Icon name="upload" size={22} />}
          title="Восстановить из копии"
          chevron
          className="setting-row"
          onClick={run(() => backupInput.current?.click())}
        />
        <ListRow
          leading={<Icon name="book" size={22} />}
          title="Импорт из Anki (.apkg)"
          chevron
          className="setting-row"
          onClick={run(() => fileInput.current?.click())}
        />
      </GroupedList>
      <p className="setting-status" role="status">
        {busy}
      </p>
      {result && (
        <Banner tone={result.tone} role={result.tone === 'error' ? 'alert' : undefined}>
          {result.text}
        </Banner>
      )}
    </div>
  );
}
