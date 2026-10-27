import { BACKLOG_THRESHOLD_MAX, BACKLOG_THRESHOLD_MIN, type ReminderSettings } from '@alsavi/reminders';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ReminderClient, ServerStatus } from './reminder-client';
import type { Platform } from './reminder-browser';
import { deviceTimeZone } from './reminder-browser';
import {
  availability,
  DENIED_TEXT,
  DENIED_TEXT_IOS,
  enableErrorText,
  failureText,
  IOS_INSTALL_NOTE,
  IOS_INSTALL_STEPS,
  lastDeliveryText,
  momentText,
  permissionLabel,
} from './reminder-view';

interface Props {
  client: ReminderClient;
  platform: Platform;
  /** Bumped when the app returns to the foreground: the status is re-read. */
  refreshKey: number;
}

type ServerState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; status: ServerStatus } | { kind: 'error'; text: string };

/**
 * «Напоминания о повторении» (TASK_034) in «Профиль»: on/off, the daily
 * time, the optional backlog reminder and its threshold, the permission and
 * subscription status, a test notification, and the iPhone instructions
 * when reminders cannot work yet. Settings are saved on the device at once
 * and sent to the push server; the server does the reminding.
 */
export function RemindersSection({ client, platform, refreshKey }: Props) {
  const [settings, setSettings] = useState<ReminderSettings>(() => client.settings());
  const [permission, setPermission] = useState(() => client.permission());
  const [server, setServer] = useState<ServerState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [thresholdInput, setThresholdInput] = useState(() => String(client.settings().backlogThreshold));
  const [timeInput, setTimeInput] = useState(() => client.settings().time);
  // The time picker reports every wheel step: send only the value it settles on.
  const timeCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repairTried = useRef(false);
  const timeId = useId();
  const backlogId = useId();
  const thresholdId = useId();
  const enabledId = useId();

  const avail = availability({ supported: client.supported(), platform, permission });

  const loadStatus = useCallback(async () => {
    setPermission(client.permission());
    if (!client.hasDevice()) {
      setServer({ kind: 'idle' });
      return;
    }
    setServer({ kind: 'loading' });
    let st = await client.status();
    // The push service dropped the subscription: renew it quietly (permission
    // is already granted, no prompt) — once per visit of the screen.
    if (typeof st !== 'string' && !st.subscribed && st.settings.enabled && client.permission() === 'granted' && !repairTried.current) {
      repairTried.current = true;
      await client.repair();
      st = await client.status();
    }
    if (typeof st === 'string') setServer(st === 'unauthorized' ? { kind: 'idle' } : { kind: 'error', text: failureText(st) });
    else setServer({ kind: 'ok', status: st });
  }, [client]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshKey]);

  async function onToggle(on: boolean) {
    setMessage(null);
    setBusy(true);
    try {
      if (on) {
        // Straight from the tap: iOS asks for permission only on a user gesture.
        const result = await client.enable(settings);
        setPermission(client.permission());
        if (result.ok) {
          setSettings(client.settings());
          setMessage({ text: `Готово: напоминание придёт в ${client.settings().time}, если будет что повторить.`, error: false });
        } else {
          setMessage({ text: enableErrorText(result, platform), error: true });
        }
      } else {
        const out = await client.disable();
        setSettings(client.settings());
        if (out !== 'synced' && out !== 'unchanged' && out !== 'idle') setMessage({ text: failureText(out), error: true });
      }
    } finally {
      setBusy(false);
      void loadStatus();
    }
  }

  async function save(next: ReminderSettings) {
    setSettings(next);
    setMessage(null);
    const out = await client.update(next);
    if (out !== 'synced' && out !== 'unchanged' && out !== 'idle') setMessage({ text: failureText(out), error: true });
    void loadStatus();
  }

  function onTimeChange(value: string) {
    setTimeInput(value);
    if (timeCommit.current) clearTimeout(timeCommit.current);
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    timeCommit.current = setTimeout(() => {
      timeCommit.current = null;
      if (value !== client.settings().time) void save({ ...client.settings(), time: value });
    }, 800);
  }

  useEffect(
    () => () => {
      if (timeCommit.current) clearTimeout(timeCommit.current);
    },
    []
  );

  function commitThreshold() {
    const n = Math.round(Number(thresholdInput));
    const value = Number.isFinite(n) ? Math.min(BACKLOG_THRESHOLD_MAX, Math.max(BACKLOG_THRESHOLD_MIN, n)) : settings.backlogThreshold;
    setThresholdInput(String(value));
    if (value !== settings.backlogThreshold) void save({ ...settings, backlogThreshold: value });
  }

  async function onTest() {
    setMessage(null);
    setBusy(true);
    try {
      const r = await client.sendTest();
      setMessage(
        r.ok
          ? { text: 'Проверочное уведомление отправлено. Если его нет через минуту — проверьте настройки уведомлений телефона.', error: false }
          : { text: failureText(r.reason), error: true }
      );
    } finally {
      setBusy(false);
      void loadStatus();
    }
  }

  const tz = deviceTimeZone();
  const now = Date.now();
  const status = server.kind === 'ok' ? server.status : null;
  const controlsOff = !settings.enabled || busy;

  return (
    <section className="panel profile-section reminders" aria-labelledby="profile-reminders">
      <h2 id="profile-reminders" className="panel-title">
        Напоминания о повторении
      </h2>

      {avail === 'ios_install' ? (
        <IosInstall />
      ) : avail === 'unsupported' ? (
        <p className="hint">Этот браузер не поддерживает push-уведомления. Напоминания работают в Chrome, Edge, Firefox, Safari на Mac и в приложении ALSAVI на экране «Домой» iPhone.</p>
      ) : (
        <>
          <div className="setting-row">
            <label htmlFor={enabledId} className="setting-label">
              Напоминать о повторении
              <span className="setting-hint">Одно уведомление в день и только если есть слова к повторению.</span>
            </label>
            <input
              id={enabledId}
              type="checkbox"
              role="switch"
              className="switch"
              checked={settings.enabled}
              disabled={busy || (avail === 'denied' && !settings.enabled)}
              onChange={(e) => void onToggle(e.target.checked)}
            />
          </div>

          {avail === 'denied' && <p className="notice notice-warning">{platform.ios ? DENIED_TEXT_IOS : DENIED_TEXT}</p>}

          <div className="setting-row">
            <label htmlFor={timeId} className="setting-label">
              Время напоминания
              <span className="setting-hint">По времени этого устройства ({tz}).</span>
            </label>
            <input
              id={timeId}
              type="time"
              className="limit-input time-input"
              value={timeInput}
              step={300}
              disabled={controlsOff}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </div>

          <div className="setting-row">
            <label htmlFor={backlogId} className="setting-label">
              Если накопилось много слов
              <span className="setting-hint">Ещё одно напоминание днём, не раньше чем через 8 часов после основного и не чаще раза в день.</span>
            </label>
            <input
              id={backlogId}
              type="checkbox"
              role="switch"
              className="switch"
              checked={settings.backlog}
              disabled={controlsOff}
              onChange={(e) => void save({ ...settings, backlog: e.target.checked })}
            />
          </div>

          {settings.backlog && (
            <div className="setting-row">
              <label htmlFor={thresholdId} className="setting-label">
                Порог, карточек
                <span className="setting-hint">
                  Сколько просроченных карточек считать «много» ({BACKLOG_THRESHOLD_MIN}–{BACKLOG_THRESHOLD_MAX}).
                </span>
              </label>
              <input
                id={thresholdId}
                type="number"
                inputMode="numeric"
                className="limit-input"
                min={BACKLOG_THRESHOLD_MIN}
                max={BACKLOG_THRESHOLD_MAX}
                step={1}
                value={thresholdInput}
                disabled={controlsOff}
                onChange={(e) => setThresholdInput(e.target.value)}
                onBlur={commitThreshold}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </div>
          )}

          <dl className="reminder-status">
            <StatusRow label="Разрешение">{permissionLabel(permission)}</StatusRow>
            <StatusRow label="Подписка Push">
              {server.kind === 'loading'
                ? 'проверяется…'
                : server.kind === 'error'
                  ? 'нет связи с сервером'
                  : status
                    ? status.subscribed
                      ? 'активна'
                      : 'нет'
                    : 'не оформлена'}
            </StatusRow>
            {settings.enabled && status?.nextDailyAt != null && (
              <StatusRow label="Следующее">{momentText(status.nextDailyAt, now, tz)}</StatusRow>
            )}
          </dl>
          {status && lastDeliveryText(status.lastDelivery, now, tz) && (
            <p className="import-status">{lastDeliveryText(status.lastDelivery, now, tz)}</p>
          )}
          {server.kind === 'error' && <p className="import-status">{server.text}</p>}
          {settings.enabled && status && !status.subscribed && permission === 'granted' && (
            <p className="import-status" role="alert">
              Подписка потеряна — выключите и снова включите напоминания.
            </p>
          )}

          {settings.enabled && status?.subscribed && (
            <div className="data-actions">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onTest()}>
                Отправить проверочное уведомление
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <p className="import-status" role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <p className="hint">
        На сервер напоминаний уходят только настройки, часовой пояс и сроки повторения карточек — без слов и переводов.
      </p>
    </section>
  );
}

function IosInstall() {
  return (
    <div className="ios-install">
      <p className="setting-hint">{IOS_INSTALL_NOTE}</p>
      <ol className="ios-steps">
        {IOS_INSTALL_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="reminder-status-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
