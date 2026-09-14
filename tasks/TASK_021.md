# TASK_021: Fix note creation failing where `crypto.randomUUID()` is unavailable

**Status: DONE.** Bug confirmed by reproduction, fixed at the source (Engine
default id generator) plus honest error reporting in the UI. Verified by
180/180 tests, clean typecheck, and manual browser checks (normal path,
fallback path, unrecoverable path, page reload). Commit hash recorded in
`PROGRESS.md`.

## Цель

Одна цель: добавление заметки/слова из UI должно надёжно доходить до
IndexedDB во всех браузерных контекстах, где приложение реально работает, а
при сбое сохранения пользователь должен видеть ошибку, а не пустой экран.

## Диагноз (подтверждён, не предположение)

- `LearningEngine` (`packages/engine/src/engine.ts`) по умолчанию использовал
  `newId = () => crypto.randomUUID()`. Вызов происходит в `addNote()` **до**
  `store.putNote()` — и так же в `review()` перед `appendReview`.
- `crypto.randomUUID` в браузерах существует **только в secure context**
  (HTTPS / `localhost`) и только начиная с Safari 15.4 / Chrome 92 /
  Firefox 95. На dev-сервере, открытом по plain-HTTP с другого устройства в
  LAN (сценарий без mkcert-сертификатов), или в старом iOS Safari метод
  равен `undefined`.
- Воспроизведение в браузере (dev-сервер, `delete Crypto.prototype.randomUUID`
  в странице): клик «Добавить карточку» → консоль
  `Uncaught (in promise) TypeError: crypto.randomUUID is not a function`,
  в IndexedDB запись **не появилась**, UI **ничего не показал** — форма
  молча осталась заполненной. `CardManager.add()` не имел `try/catch`;
  `onSubmit={(e) => void add(e)}` отбрасывал rejection.
- Та же причина у `apps/web/src/dexie-store.ts` (миграция v1→v2 звала
  `crypto.randomUUID()` напрямую): для v1-базы в таком контексте БД вообще не
  открылась бы.

## Решение

**Слой: Engine (генератор id) + UI (показ ошибки). Storage-адаптер — одна
строка, та же причина.**

1. `packages/engine/src/ids.ts` (новый): `generateId()` —
   `crypto.randomUUID()` при наличии; иначе RFC 4122 v4 UUID из
   `crypto.getRandomValues()` (16 байт, выставлены биты version/variant,
   тот же канонический строковый формат, те же 122 бита случайности);
   если нет ни того ни другого — `throw` с понятным сообщением.
   `Math.random()` **не используется** — id постоянные ключи, слабый
   источник недопустим; отказ сохранить безопаснее тихой коллизии.
2. `engine.ts`: `this.newId = options.newId ?? generateId`. Инъекция `newId`
   в тестах не изменилась; существующие id не переписываются — формат
   fallback-id совпадает с нативным, старые и новые записи сосуществуют.
3. `index.ts`: экспорт `generateId` (утилита, не API `LearningEngine`;
   прецедент — `assertValidNewCardsPerDay`).
4. `apps/web/src/dexie-store.ts`: миграция v1→v2 использует `generateId()`.
5. `apps/web/src/CardManager.tsx`: `add()` в `try/catch`; при ошибке —
   сообщение «Не удалось сохранить карточку: …» под формой, введённый текст
   сохраняется для повтора; поля очищаются **только после** успешного
   `addNote`; кнопка `disabled` на время сохранения (нет двойной отправки).

Не затронуто: Review Log (append-only), FSRS `Scheduler`, схема IndexedDB
(версии 1–3 без изменений), контракт `EngineStore`, backup-формат.

## Definition of Done

- [x] Проблема воспроизведена и подтверждена (консоль + IndexedDB + UI).
- [x] `generateId`: нативный путь, fallback на `getRandomValues`, throw без
      источника, без `Math.random`.
- [x] Уникальность и неизменность id существующих заметок сохранены.
- [x] Ошибка сохранения видна пользователю; ложного «сохранено» нет.
- [x] Тесты: `packages/engine/test/ids.test.ts` (9: native path, fallback
      формат/уникальность/детерминизм битов, throw без источника без
      `Math.random`, `addNote`/`review` через движок без `randomUUID`);
      `apps/web/test/add-note-dexie.test.ts` (3: реальная запись в
      fake-IndexedDB через `DexieStore` с дефолтным генератором — с
      `randomUUID` и без; чтение через новый экземпляр адаптера =
      «перезагрузка»; сосуществование старых и fallback-id).
- [x] `npm test` 180/180; `tsc --noEmit` чист в `packages/engine` и
      `apps/web`; `git diff --check` чист.
- [x] Ручная проверка в браузере: добавление с `randomUUID`; без
      `randomUUID` (fallback, id в формате v4, без ошибок в консоли); без
      обоих источников (сообщение об ошибке, текст в полях сохранён, счётчик
      не изменился); перезагрузка страницы — все записи на месте, id
      fallback-заметки неизменен.
- [x] `PROGRESS.md` обновлён; отдельный коммит.

## Вне рамок

Новая функциональность, AI Layer, рефакторинг; обработка ошибок в других
handlers (`remove`, импорт) — не менялись.
