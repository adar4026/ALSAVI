import type { LearningEngine } from '@alsavi/engine';
import { useState } from 'react';
import { exportBackup, type BackupStore } from './backup-export';
import { snoozeUntil } from './backup-reminder';
import { Banner, Button, toasts } from './ui';

interface Props {
  engine: LearningEngine;
  store: BackupStore;
  /** From `backupSuggestion()`. */
  text: string;
  /** The suggestion is done (copy saved or «Позже»): the home screen drops it. */
  onDone: () => void;
}

/**
 * Home screen suggestion to save a backup copy (TASK_048). Quiet `info`
 * banner under the day's card: the main action stays «Начать повторение».
 * «Сохранить копию» runs the same export as «Профиль»; «Позже» hides it for
 * a few days.
 */
export function BackupBanner({ engine, store, text, onDone }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The pressed button disappears with the banner — keep the focus on the
  // screen's main action instead of losing it to <body>.
  const refocus = () => document.querySelector<HTMLElement>('.home-cta, .home-recheck')?.focus();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await exportBackup(store, engine);
      toasts.show({ message: 'Резервная копия сохранена.' });
      onDone();
      refocus();
    } catch (err) {
      setError(`Не удалось сохранить копию: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }

  function later() {
    // Hidden at once; if the write fails the suggestion simply returns next time.
    void store.setBackupSnooze(snoozeUntil(Date.now())).catch(() => undefined);
    onDone();
    refocus();
  }

  return (
    <Banner
      tone={error ? 'error' : 'info'}
      className="home-backup"
      actions={
        <>
          <Button variant="secondary" icon="download" loading={saving} onClick={() => void save()}>
            {saving ? 'Сохраняю…' : 'Сохранить копию'}
          </Button>
          <Button variant="tertiary" disabled={saving} onClick={later}>
            Позже
          </Button>
        </>
      }
    >
      {error ?? text}
    </Banner>
  );
}
