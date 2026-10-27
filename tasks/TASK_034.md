# TASK_034: Напоминания о повторении (Web Push)

**Status: WORKER DEPLOYED (2026-10-27) — PWA публикуется; доставка на iPhone ждёт проверки владельцем.**
Серверные push-напоминания «Пора повторить слова» по расписанию FSRS:
Cloudflare Worker + D1 + Cron, раздел «Напоминания о повторении» в
«Профиле», обработка push и нажатия в `sw.js`. Engine, FSRS, `StudySession`,
Review Log, Dexie-схема и формат резервных копий не менялись. `npm test` —
**537 passed + 1 skipped** (было 469 + 1).

Полное описание архитектуры, правил, деплоя и проверки на iPhone —
[`docs/REMINDERS.md`](../docs/REMINDERS.md); архитектурная сводка —
`ARCHITECTURE.md` §11f.

## Исходное состояние (что нашлось)

- В ALSAVI **не было** ни Cloudflare Worker, ни D1, ни push, ни cron:
  приложение полностью локальное (IndexedDB, GitHub Pages). Бриф
  предполагал существующую инфраструктуру — её нет. Параллельной системы
  уведомлений создавать было не с чем: это первая.
- Рабочая Web Push-инфраструктура есть в соседнем проекте LexLife
  (Worker + D1 + cron, проверена на iPhone владельца). Взяты её **паттерны и
  код шифрования** (VAPID ES256, aes128gcm на WebCrypto, токен устройства,
  атомарный claim, allowlist push-сервисов), но **отдельный Worker и
  отдельная D1**: другие данные, другой origin, другая модель расписания.

## Слой задачи

- **Engine** — без изменений (только публичный API: `getCardsDueBy`,
  `countNewCardsAnsweredSince`).
- **Новый чистый пакет** `@alsavi/reminders` — снимок расписания, подсчёт,
  пояса/DST, тексты; общий для PWA и Worker'а.
- **Новый сервер** `apps/push-worker` (`@alsavi/push-worker`).
- **UI / PWA** — `apps/web`.

## Ключевые решения и почему

1. **PWA остаётся на GitHub Pages; Worker — только API (CORS).** Перенос
   приложения на `workers.dev` сменил бы origin: все карточки остались бы в
   IndexedDB старого адреса.
2. **Сервер не планирует — он считает.** Приложение отправляет гистограмму
   сроков `due` (округление вверх: никогда раньше срока; 5 мин на неделю
   вперёд, 1 ч до 60 дней, 1 день дальше). Число в уведомлении = «очередь на
   сегодня» новой сессии (начатые со сроком ≤ сейчас + новые в пределах
   дневного лимита), посчитанное в момент отправки по последнему снимку.
   Точно и при закрытом приложении: `due` меняется только действиями в
   приложении, после которых уходит новый снимок.
3. **Никаких данных обучения на сервере** — ни слов, ни id карточек, ни
   истории. При выключении напоминаний снимок на сервере стирается.
4. **Тихие умолчания.** Выключено, пока пользователь не включит; затем одно
   уведомление в день и только если есть что повторять. «Накопилось много
   слов» — по желанию, ≤ 1 в день, днём, ≥ 8 ч после любого напоминания; если
   долг большой уже к основному времени — основное само говорит «Накопились…»
   (одно уведомление, не два).
5. **Максимум одна доставка.** `UNIQUE(device, kind, local_day)` + сдвиг
   `next_daily_at` в одной транзакции; зависший claim не повторяется.
6. **Нажатие без второго окна и без перезагрузки:** открытое окно получает
   `postMessage` + `focus()`; иначе `openWindow('./#/review')`.
7. **`wrangler` — devDependency `@alsavi/push-worker`** (как в LexLife),
   чтобы `npm run dev / deploy` работали без глобальной установки.

## Найдено попутно и исправлено

- **`apps/web/test/practice-flow.test.ts` — «бомба замедленного
  действия».** Часы движка в тесте зафиксированы на 21.10.2026, а
  `StudySession` создавалась на реальных часах: с ~22.10 каждая отвеченная
  карта сразу снова «due», цикл «отвечать, пока есть карточки» стал
  бесконечным (OOM процесса vitest, на CI — падение `npm test` и деплоя).
  Исправлено только в тесте: сессия получает тот же `clock`. Логика
  приложения не менялась.

## Как проверялось

- **Автотесты (+68):** `@alsavi/reminders` 16, `@alsavi/push-worker` 34
  (D1 на node:sqlite с настоящими миграциями; push-сервис расшифровывает
  каждое сообщение как браузер и проверяет VAPID JWT), web +18
  (`reminders-e2e`, `sw-push`, `reminder-view`). Требования брифа:

  | Требование | Тест |
  |---|---|
  | нет уведомления при 0 карточек | `worker: is not sent when nothing is due`, `…no cards at all` |
  | отправка в заданное время, не раньше | `worker: is sent at the chosen local time…` |
  | правильное число | там же (3 карточки), `counts new cards only within the daily limit`, e2e: число = `StudySession.overview()` 12 дней подряд |
  | защита от дублей | `parallel cron runs…`, `moving the time later…`, `routine sync…`, `stale rev 409`, `endpoint takeover` |
  | часовой пояс, DST, полночь | `time-zone change…`, `09:00 across DST`, `00:00 / 23:59`, `allowance resets at local midnight`; reminders: Мадрид, Нью-Йорк, gap/overlap |
  | отключение пользователем | `sends nothing while disabled…`, e2e `turning reminders off…` |
  | недействительная подписка | `410 removed…`, `403 kept`, e2e `renewed on the next app start` |
  | открытие экрана повторения | `sw-push: focuses that window… / starts it on the study session`, `#/review link` |
  | доставка при закрытом приложении | e2e `the app stays closed for days…`, worker `works while the app stays closed` |
  | повторы, ошибки, конфигурация | `retried with backoff…`, `dropped if studied`, `gives up…`, `late skip`, `503 not configured` |

- **Настоящий рантайм:** `wrangler deploy --dry-run` (бандл 40 KiB);
  `wrangler dev` (workerd + локальная D1, миграция применена): CORS (чужой
  origin → 403), регистрация, sync, статус; cron через `/__scheduled` в
  18:40 принял решение «daily, 2 карточки», отправил **настоящий**
  зашифрованный push на `fcm.googleapis.com` с VAPID; FCM ответил 410 на
  тестовый токен → подписка удалена, в UI «не доставлено: подписка устарела».
- **Браузер (production-сборка, `vite preview` против локального Worker'а):**
  раздел в светлой/тёмной теме, 320 px без горизонтального скролла;
  состояние «запрещено»; включение (разрешение и PushManager подменены в
  странице — встроенный браузер блокирует уведомления) → «разрешены ·
  активна · завтра в 09:00»; смена времени → «сегодня в 18:40» на сервере;
  добавление двух слов → один автоматический sync с `[[минута, 2]]`;
  `#/review`: в открытом приложении, холодный старт и сообщение service
  worker'а — все три сразу открывают сессию «1 из 2». Тестовые данные
  профиля и локальная D1 удалены, серверы остановлены.
- `tsc --noEmit` чист во всех 8 пакетах; `npm run build` и `git diff --check`
  чисты.

## Production-деплой (2026-10-27)

Аккаунт Cloudflare тот же, что у LexLife (`alexus4026.workers.dev`), ресурсы
отдельные: D1 `lexlife` и Worker LexLife не затрагивались.

- **D1** `alsavi-reminders` создана (регион WEUR), `database_id`
  `c9568c84-9be9-4804-85b3-6c29146cbbd9` в `wrangler.jsonc`.
  `npm run db:migrate:remote` → `0001_review_reminders.sql` ✅; в удалённой
  базе таблицы `devices`, `push_subscriptions`, `deliveries` и три индекса.
- **VAPID:** новая пара (не от LexLife). Публичный ключ — `wrangler.jsonc`
  `vars` (PWA берёт его из `GET /api/config`, в сборку не вшит).
  `VAPID_PRIVATE_KEY` и `VAPID_SUBJECT` — секреты Worker'а; приватный ключ
  передан в `wrangler secret put` через pipe, нигде не сохранён (ротация —
  `docs/REMINDERS.md`). `VAPID_SUBJECT` = `https://adar4026.github.io/ALSAVI/`
  (RFC 8292 допускает https-URI; e-mail не уходит в push-сервисы).
- **Worker** `alsavi-push` → `https://alsavi-push.alexus4026.workers.dev`,
  version `ea481d43-6e36-4391-98b7-0d991ad7626b`; привязки: `DB`
  (alsavi-reminders, удалённая), `RATE_LIMITER`, `VAPID_PUBLIC_KEY`,
  `ALLOWED_ORIGINS`. Cron `* * * * *` зарегистрирован (Cloudflare API
  `/schedules`).
- **Smoke-тест production API** (временное устройство, удалено в конце):
  17/17 — `/api/config` отдаёт только публичный ключ; CORS
  `https://adar4026.github.io`, чужой origin → 403, preflight 204; без
  токена 401; регистрация 201 / повтор 409; sync → `nextDailyAt` 09:00
  Europe/Madrid = 08:00 UTC (после перехода на зимнее время); устаревший
  `rev` 409; неверные настройки 400; endpoint вне allowlist 400; проверочное
  без подписки 409; выключение → `nextDailyAt: null`; удаление → 401.

## Не проверено (нужен настоящий iPhone)

- Доставка через `web.push.apple.com` на iPhone с заблокированным экраном,
  нажатие из Центра уведомлений, поведение `focus()` в iOS PWA, cron-
  напоминание при закрытом приложении — по инструкции в
  `docs/REMINDERS.md`. Без подписки настоящего устройства реальная доставка
  не подтверждена.

## Известные ограничения

- Если позаниматься **без сети** и не открывать приложение онлайн до
  времени напоминания, сервер не знает об этих ответах и может назвать
  устаревшее число (на iOS нельзя «молча» не показать полученный push).
- Число не включает 20-минутный learn-ahead сессии (на Главной он есть):
  возможна разница в 1–2 изучаемые карточки в первые минуты после занятия.
- Очень далёкие сроки (> 60 дней) округлены до суток — уведомление может
  прийти на ≤ 1 день позже, только если приложение не открывалось 2 месяца.
- iPhone: только приложение с экрана «Домой», iOS 16.4+; Safari-вкладка и
  установленное приложение хранят карточки раздельно.

## Изменённые файлы

Новые: `packages/reminders/**`, `apps/push-worker/**` (wrangler.jsonc,
migrations/0001_review_reminders.sql, src/{index,api,cron,policy,delivery,
webpush,auth,d1,log}.ts, scripts/gen-vapid.mjs, test/**),
`apps/web/src/{reminder-client,reminder-browser,reminder-snapshot,
reminder-view}.ts`, `apps/web/src/RemindersSection.tsx`,
`apps/web/test/{reminders-e2e,sw-push,reminder-view}.test.ts`,
`docs/REMINDERS.md`, этот файл.
Изменены: `apps/web/public/sw.js` (push, notificationclick),
`apps/web/src/App.tsx` (клиент напоминаний, `#/review`, сообщения SW,
синхронизация), `ProfileScreen.tsx`, `nav.ts`, `styles.css`,
`apps/web/package.json`, `apps/web/test/practice-flow.test.ts` (часы),
корневой `package.json` (тесты новых пакетов), `package-lock.json`,
`.claude/launch.json` (`alsavi-push-worker`), `ARCHITECTURE.md` (§11f).
