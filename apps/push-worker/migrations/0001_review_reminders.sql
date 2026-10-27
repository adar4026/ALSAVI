-- ALSAVI D1: review-reminder infrastructure ONLY.
-- No learning content here, ever: no words, translations, examples, notes,
-- card ids or review history. The schedule is a histogram of FSRS due dates
-- (counts per time bucket) — enough to say "18 cards are waiting", nothing
-- more. Times are INTEGER epoch ms, UTC.

-- A device without an account: random UUID + SHA-256 of a secret token.
-- The token itself lives only on the device (localStorage).
CREATE TABLE devices (
  id                TEXT    PRIMARY KEY,               -- random UUID v4 made on the device
  token_hash        TEXT    NOT NULL,                  -- hex SHA-256 of the token
  timezone          TEXT,                              -- IANA, e.g. Europe/Madrid
  enabled           INTEGER NOT NULL DEFAULT 0,        -- master switch «Напоминания о повторении»
  daily_time        TEXT    NOT NULL DEFAULT '09:00',  -- local HH:MM of the daily reminder
  backlog           INTEGER NOT NULL DEFAULT 0,        -- extra reminder on a large backlog
  backlog_threshold INTEGER NOT NULL DEFAULT 30,       -- overdue cards that make it relevant
  snapshot          TEXT,                              -- JSON ReviewSnapshot (@alsavi/reminders)
  snapshot_at       INTEGER,                           -- generatedAt of that snapshot
  sync_rev          INTEGER NOT NULL DEFAULT 0,        -- last accepted sync revision (monotonic)
  next_daily_at     INTEGER,                           -- UTC moment of the next daily reminder; NULL = none
  last_seen_at      INTEGER,                           -- last app start (GET /api/status)
  last_test_at      INTEGER,                           -- rate limit of the test notification
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
-- The per-minute cron reads due daily reminders from this partial index only.
CREATE INDEX idx_devices_next_daily ON devices(next_daily_at)
  WHERE enabled = 1 AND next_daily_at IS NOT NULL;

-- Web Push subscription. One per device; an endpoint belongs to one device.
-- The endpoint identifies the phone at the push service: never shown in
-- the UI, logs or API responses.
CREATE TABLE push_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id       TEXT    NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  endpoint        TEXT    NOT NULL UNIQUE,
  p256dh          TEXT    NOT NULL,
  auth            TEXT    NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  failure_count   INTEGER NOT NULL DEFAULT 0
);

-- One reminder cycle = one row. UNIQUE (device_id, kind, local_day) is the
-- atomic claim: a second cron run, a retry or a time/zone change can never
-- produce a second notification of the same kind on the same local day.
CREATE TABLE deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id       TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL,          -- daily | backlog
  local_day       TEXT    NOT NULL,          -- YYYY-MM-DD in the device zone
  scheduled_at    INTEGER NOT NULL,          -- planned moment (daily) / decision moment (backlog)
  variant         TEXT,                      -- wording sent: daily | backlog
  card_count      INTEGER,                   -- number in the notification
  status          TEXT    NOT NULL,          -- claimed | sent | retry | failed | skipped | expired | unknown
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  error_code      TEXT,                      -- late | empty | disabled | no_subscription | gone:410 | retry:503 …
  created_at      INTEGER NOT NULL,
  sent_at         INTEGER,
  UNIQUE (device_id, kind, local_day)
);
CREATE INDEX idx_deliveries_retry ON deliveries(next_attempt_at) WHERE status = 'retry';
CREATE INDEX idx_deliveries_device_created ON deliveries(device_id, created_at);
