import { BACKLOG_THRESHOLD_MAX, BACKLOG_THRESHOLD_MIN, type ReminderSettings } from '@alsavi/reminders';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
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
  reminderStatusLine,
  type ReminderStatusTone,
} from './reminder-view';
import { SettingRow } from './SettingRow';
import { Banner, GroupedList, ListRow, Stepper, Switch, toasts } from './ui';

interface Props {
  client: ReminderClient;
  platform: Platform;
  /** Bumped when the app returns to the foreground: the status is re-read. */
  refreshKey: number;
}

type ServerState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; status: ServerStatus } | { kind: 'error'; text: string };

/** The backlog threshold stepper: ±5 cards, saved once the value settles. */
const THRESHOLD_STEP = 5;
const THRESHOLD_SAVE_DELAY_MS = 600;

const STATUS_ICON: Record<ReminderStatusTone, IconName> = { ok: 'check', off: 'minus', pending: 'refresh', warning: 'info' };

/**
 * «Напоминания» (TASK_034, laid out as a grouped list in TASK_043) in
 * «Профиль»: on/off, the daily time, the optional backlog reminder and its
 * threshold, a one-line status, a test notification; the permission /
 * subscription details under «Как это работает». The iPhone instructions
 * stay in view (a banner) when reminders cannot work yet. Settings are saved
 * on the device at once and sent to the push server; the server does the
 * reminding. Successes are toasts, problems are banners.
 */
export function RemindersSection({ client, platform, refreshKey }: Props) {
  const [settings, setSettings] = useState<ReminderSettings>(() => client.settings());
  const [permission, setPermission] = useState(() => client.permission());
  const [server, setServer] = useState<ServerState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [threshold, setThreshold] = useState(() => client.settings().backlogThreshold);
  const thresholdCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thresholdLatest = useRef(threshold);
  const [timeInput, setTimeInput] = useState(() => client.settings().time);
  // The time picker reports every wheel step: send only the value it settles on.
  const timeCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repairTried = useRef(false);
  const timeId = useId();
  const backlogId = useId();
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
          toasts.show({ message: `Готово: напоминание придёт в ${client.settings().time}, если будет что повторить.` });
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

  // Leaving the screen within the delay still saves what was chosen.
  useEffect(
    () => () => {
      if (timeCommit.current) clearTimeout(timeCommit.current);
      if (thresholdCommit.current) {
        clearTimeout(thresholdCommit.current);
        thresholdCommit.current = null;
        void client.update({ ...client.settings(), backlogThreshold: thresholdLatest.current });
      }
    },
    [client]
  );

  function onThresholdChange(value: number) {
    setThreshold(value);
    thresholdLatest.current = value;
    if (thresholdCommit.current) clearTimeout(thresholdCommit.current);
    thresholdCommit.current = setTimeout(() => {
      thresholdCommit.current = null;
      if (value !== client.settings().backlogThreshold) void save({ ...client.settings(), backlogThreshold: value });
    }, THRESHOLD_SAVE_DELAY_MS);
  }

  async function onTest() {
    setMessage(null);
    setBusy(true);
    try {
      const r = await client.sendTest();
      if (r.ok) toasts.show({ message: 'Проверочное уведомление отправлено. Нет через минуту — проверь настройки уведомлений.' });
      else setMessage({ text: failureText(r.reason), error: true });
    } finally {
      setBusy(false);
      void loadStatus();
    }
  }

  const tz = deviceTimeZone();
  const now = Date.now();
  const status = server.kind === 'ok' ? server.status : null;
  const controlsOff = !settings.enabled || busy;
  const canConfigure = avail === 'ready' || avail === 'denied';
  const line = reminderStatusLine({
    availability: avail,
    enabled: settings.enabled,
    permission,
    server: server.kind,
    subscribed: status?.subscribed,
    nextDailyAt: status?.nextDailyAt,
    now,
    timeZone: tz,
  });
  const lastText = status ? lastDeliveryText(status.lastDelivery, now, tz) : null;

  return (
    <div className="profile-group reminders">
      {/* Not behind «Как это работает»: without the Home Screen app nothing below can work. */}
      {avail === 'ios_install' && (
        <Banner tone="info" className="ios-install">
          <p>{IOS_INSTALL_NOTE}</p>
          <ol className="ios-steps">
            {IOS_INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Banner>
      )}

      <GroupedList
        title="Напоминания"
        note="На сервер напоминаний уходят только настройки, часовой пояс и сроки повторения карточек — без слов и переводов."
      >
        {canConfigure && (
          <>
            <SettingRow
              title="Напоминать о повторении"
              hint="Одно уведомление в день — если есть что повторить."
              htmlFor={enabledId}
              control={
                <Switch
                  id={enabledId}
                  checked={settings.enabled}
                  disabled={busy || (avail === 'denied' && !settings.enabled)}
                  onChange={(e) => void onToggle(e.target.checked)}
                />
              }
            />
            <SettingRow
              title="Время"
              hint={`По часам этого устройства (${tz}).`}
              htmlFor={timeId}
              control={
                <input
                  id={timeId}
                  type="time"
                  className="setting-time"
                  value={timeInput}
                  step={300}
                  disabled={controlsOff}
                  onChange={(e) => onTimeChange(e.target.value)}
                />
              }
            />
            <SettingRow
              title="Если накопилось много слов"
              hint="Ещё одно напоминание днём: не раньше чем через 8 часов после основного и не чаще раза в день."
              htmlFor={backlogId}
              control={
                <Switch
                  id={backlogId}
                  checked={settings.backlog}
                  disabled={controlsOff}
                  onChange={(e) => void save({ ...settings, backlog: e.target.checked })}
                />
              }
            />
            {settings.backlog && (
              <SettingRow
                title="Порог"
                hint={`Сколько просроченных карточек считать «много» (${BACKLOG_THRESHOLD_MIN}–${BACKLOG_THRESHOLD_MAX}).`}
                control={
                  <Stepper
                    label="Порог напоминания, карточек"
                    value={threshold}
                    min={BACKLOG_THRESHOLD_MIN}
                    max={BACKLOG_THRESHOLD_MAX}
                    step={THRESHOLD_STEP}
                    disabled={controlsOff}
                    onChange={onThresholdChange}
                  />
                }
              />
            )}
          </>
        )}
        <SettingRow
          title="Статус"
          control={
            <span className={`reminder-state reminder-state--${line.tone}`} role="status">
              <Icon name={STATUS_ICON[line.tone]} size={16} />
              {line.text}
            </span>
          }
        />
        {settings.enabled && status?.subscribed && (
          <ListRow title="Проверить уведомление" chevron className="setting-row" onClick={() => {
              if (!busy) void onTest();
            }} />
        )}
      </GroupedList>

      {avail === 'denied' && <Banner tone="warning">{platform.ios ? DENIED_TEXT_IOS : DENIED_TEXT}</Banner>}
      {avail === 'unsupported' && (
        <Banner tone="info">
          Этот браузер не поддерживает push-уведомления. Напоминания работают в Chrome, Edge, Firefox, Safari на Mac и в
          приложении ALSAVI на экране «Домой» iPhone.
        </Banner>
      )}
      {settings.enabled && status && !status.subscribed && permission === 'granted' && (
        <Banner tone="warning">Подписка потеряна — выключи и снова включи напоминания.</Banner>
      )}
      {server.kind === 'error' && <Banner tone="warning">{server.text}</Banner>}
      {message && (
        <Banner tone={message.error ? 'error' : 'info'} role={message.error ? 'alert' : undefined}>
          {message.text}
        </Banner>
      )}

      <details className="profile-details">
        <summary>Как это работает</summary>
        <p>
          Напоминание приходит в выбранное время, только если в этот день есть карточки к повторению. Второе — «если накопилось
          много слов» — днём, когда просроченных карточек больше порога.
        </p>
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
        {lastText && <p>{lastText}</p>}
      </details>
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
