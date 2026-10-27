# ALSAVI — project notes for Claude Code

Система долговременного запоминания (SRS нового поколения). Полный манифест — в корневом брифе пользователя; текущее состояние — в `PROGRESS.md` (читать в начале каждой сессии, обновлять в конце).

## Архитектурный инвариант (не нарушать)

**Learning Engine** (`packages/engine`) — детерминированное ядро: FSRS-планирование, карточки, лог повторений, статистика. Ни одного импорта сети или AI; это проверяется тестом `layer boundary` в `test/engine.test.ts`. Лог повторений — source of truth; scheduling-состояние карточки — кэш.

**AI Layer** (ещё не создан, Phase 2) — будет обращаться к ядру только через публичный API `LearningEngine`. Никогда напрямую в хранилище. AI не вмешивается в расчёт расписания.

Границы обратимости: алгоритм SRS спрятан за `Scheduler` (src/scheduler.ts), хранилище — за `EngineStore` (src/store.ts). Менять реализацию — можно, менять контракт — отдельное обсуждение.

## Структура

- `packages/engine` — @alsavi/engine, чистый TS, зависимость только ts-fsrs. Тесты: vitest.
- `apps/web` — @alsavi/web, Vite + React 19, Dexie (IndexedDB) адаптер `DexieStore`, UI на русском.
- `packages/reminders` — @alsavi/reminders, чистый: снимок сроков FSRS для push-напоминаний, пояса/DST, тексты.
- `apps/push-worker` — @alsavi/push-worker, Cloudflare Worker (API + D1 + Cron, Web Push) для напоминаний; деплой вручную, см. `docs/REMINDERS.md`. Данных обучения на сервере нет.

## Команды

- `npm test` — тесты ядра (из корня)
- `npm run dev` — dev-сервер web на http://localhost:5173 (порт зафиксирован в vite.config.ts)
- typecheck: `npx tsc --noEmit` внутри пакета

## Правила работы

- Детерминизм ядра: fuzz в FSRS выключен; любое изменение планирования — только с тестом на регрессию расписания.
- Редактирование контента карточки никогда не трогает scheduling.
- Перед задачей определить слой (Engine / AI Layer / UI); обновить `PROGRESS.md` в конце сессии.
- npm-кэш пользователя сломан (root-owned): при установке пакетов использовать `--cache` во временной директории, пока пользователь не выполнит `sudo chown -R 502:20 ~/.npm`.
