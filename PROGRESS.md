# PROGRESS

## 2026-10-12 — TASK_024: пример и личная заметка во время повторения

**Сделано.** После «Показать ответ» сессия показывает под ответом блоки
«Пример» и «Моя заметка» (поля `example`/`memo` из TASK_023) — только
заполненные и только после раскрытия, в прямых и обратных карточках. Полный
разбор — `tasks/TASK_024.md`; коротко:

- **Только UI.** `review-flow.ts`: чистая `answerContext(note)` (обрезка,
  пустое → `null`) и поле состояния `context`, которое заполняет только
  `reveal()`. `ReviewSession.tsx`: два `<section>` с заголовками `<h3>`,
  текст — обычный текстовый узел React (`pre-wrap`, без HTML).
  `styles.css`: вторичный блок на мягком фоне, перенос длинных слов,
  **липкая нижняя панель оценок** (`position: sticky`, safe-area) — длинный
  текст прокручивается, кнопки остаются на экране.
- Engine, StudySession, FSRS/Learning Steps, Review Log, порядок показа,
  Dexie, backup, CI, AI — не менялись.

**Тесты и проверки.** +17 тестов (web 76 → 93): `npm test` — **274 passed +
1 skipped** (engine 104, anki-import 18+1 skipped, backup 23, ai 13, cli 23,
web 93). `tsc --noEmit` чист во всех 6 пакетах; `npm run build` чист; `git
diff --check` чист. Ручная проверка (dev-сервер, пустой профиль): четыре
сочетания полей, прямая и обратная карточки, сессия до итога (клавиши и
мышь), правка в «Карточки» → перезагрузка → новый контекст, расписание и
лог не тронуты; 320/375/390/430 px без горизонтального скролла. Тестовые
данные удалены.

**Решения и почему.**
- Контекст — только после раскрытия в обоих направлениях: пример обычно
  содержит само слово и у обратной карточки выдаёт ответ. Одно правило
  проще и безопаснее, чем исключения по направлению.
- Гарантия «не видно до раскрытия» — в контроллере (`context === null`), а
  не только в JSX: проверяется headless-тестами (React Testing Library в
  проекте нет).
- Липкая панель вместо внутренней прокрутки: на iPhone вложенный скролл
  неудобен; с коротким текстом раскладка прежняя.

**Отложено и почему.**
- Найдено попутно: Enter на кнопке оценки, выбранной через Tab, записывает
  «Хорошо» (глобальный обработчик TASK_022 перехватывает Enter). Условие
  задачи — не менять клавиши; отдельная задача.
- Подсказка «1 · 2 · 3 · 4» на телефоне лишняя — косметика.

**Коммит и деплой.** `b390ea76b7ff7c29284baa38e9575b0c11ee2bf9`
(`feat(study): show the note's example and personal memo after revealing
the answer`), запушен в `origin/main`; workflow `38275919947` (build с
`npm test` + deploy) — успешно; deployment record GitHub Pages — тот же SHA.
Production `https://adar4026.github.io/ALSAVI/`: HTTP 200, `CACHE_VERSION =
alsavi-shell-b390ea76b7ff`, бандл `index-DRIx77-z.js` / `index-6-eIzNGj.css`
(совпадает с локальной сборкой, содержит новые блоки и липкую панель),
ассеты 200, консоль без ошибок, на 375 px без горизонтального скролла.
Проверка production — только чтение: данные не создавались, поэтому
сессия с примером/заметкой интерактивно проверена на dev, а не на
production.

**Следующий шаг.** По плану владельца; кандидат — исправить Enter на
сфокусированной кнопке оценки (см. «Отложено»).

---

## 2026-10-12 — TASK_023: управление карточками — поиск, теги, фильтры, редактирование, архив

**Сделано.** Вкладка «Карточки» доведена до ежедневного использования с
iPhone. Полный разбор — `tasks/TASK_023.md`; коротко:

- **Engine (аддитивно).** `Note` получила необязательные `example`, `memo`,
  `tags`, `archivedAt`; `addNote`/`updateNoteContent` принимают их (теги
  нормализует ядро — новый `normalizeTags`); `CardView` несёт `note`. Новые
  `archiveNote`/`unarchiveNote`: архив только помечает заметку, ничего не
  удаляет; карты архивных заметок исключены из `getDueCards`/`getCardsDueBy`
  (значит, из очередей `StudySession`) и из счётчиков карт `getStats`.
  Схема IndexedDB не менялась — старые карточки открываются с `tags: []` без
  миграции и без сброса.
- **Backup.** Проверка типов новых полей при восстановлении; формат и
  `BACKUP_VERSION = 1` прежние.
- **UI.** `card-list.ts` (поиск без учёта регистра/пробелов/испанских
  диакритик, фильтры тегов и состояния, дубли), `note-form.ts` +
  `NoteForm.tsx` (создание/редактирование, валидация по полям, мягкое
  предупреждение о дубле, ошибка записи не теряет ввод), `archive-flow.ts`
  (подтверждение, «Отмена», «Вернуть»). `CardManager.tsx` перестроен: строка
  на заметку, «Изменить» на месте, «В архив», раздел «Архив»; импорт/бэкап/
  лимит — в сворачиваемом блоке, их логика не менялась.

**Тесты и проверки.** +58 тестов: `npm test` — **257 passed + 1 skipped**
(engine 104, anki-import 18+1 skipped, backup 23, ai 13, cli 23, web 76).
`tsc --noEmit` чист во всех 6 пакетах; `npm run build` чист; `git diff
--check` чист. Ручная проверка в браузере (dev-сервер, изолированный пустой
профиль): добавление с тегами, поиск, фильтры, дубль, редактирование
карточки с историей → перезагрузка → карточка продолжила учиться
(`learning → review`, лог дописан, не переписан), архив/отмена/«Вернуть»,
сбой IndexedDB, 320/375/390/430 px. Тестовые данные удалены.

**Решения и почему.**
- **Архив вместо удаления.** Найдена существующая проблема: старая кнопка
  `×` (`engine.deleteCard`) у карточки с историей оставляла в Review Log
  повторения без карты, а `parseBackup` такие копии **отклоняет** — все
  последующие бэкапы становились невосстановимыми. Чистить лог нельзя
  (INV-4). Архив сохраняет ссылочную целостность по построению и обратим.
- Исключение архивных карт — в due-запросах ядра, а не в `StudySession`:
  порядок показа, learn-ahead, bury и дневной лимит не менялись; без архивных
  заметок запросы возвращают ровно прежнее.
- Поиск/фильтры — политика потребителя поверх `listCardViews()` (принцип №8,
  ядро не query-слой); «трудные» = существующий `scheduling.lapses > 0`.
- Форма и архив — headless-контроллеры (паттерн `ReviewFlowController`
  TASK_022): поведение при ошибках и отмене покрыто тестами без React
  Testing Library.

**Отложено и почему.**
- **Уже существующие бэкапы с «осиротевшими» повторениями.** Если на
  production до TASK_023 удалялись карточки с историей, текущие копии могут
  не проходить восстановление. Исправление (например, экспорт без сирот или
  мягкая валидация с отчётом) меняет контракт бэкапа/INV-9 — отдельная задача.
- AI `ContextAssembler` берёт все `listCardViews()`, включая архивные
  заметки; AI в этой задаче не трогали.
- Показ примера/заметки в сессии «Повторение» — вкладку по условию не меняли;
  кандидат на следующую задачу (пример усиливает припоминание).

**Коммит и деплой.** `845bddb581a916a2b0f92e3514466c2d899a5d0a` (`feat(cards):
search, tags, filters, in-place editing and archive for the card list`),
запушен в `origin/main`; workflow `38269997643` (build с `npm test` + deploy) —
успешно; deployment record GitHub Pages — тот же SHA. Production
`https://adar4026.github.io/ALSAVI/`: HTTP 200, `CACHE_VERSION =
alsavi-shell-845bddb581a9`, ассеты 200, консоль без ошибок.

**Найдено при проверке production и исправлено.** На пустой коллекции блок
поиска/фильтров оставался видимым: атрибут `hidden` перебивался правилом
`.list-controls { display: flex }` (в dev проверялось свойство `hidden`, а не
видимость). Исправлено условным рендером, проверено визуально в dev (пустая
коллекция — только CTA; с карточкой — поиск и 6 фильтров на месте), тесты и
build повторно зелёные.

**Исправление задеплоено.** `e980bc0fd662df494bfc7a979a9fcd6212ea57ef`
(`fix(cards): hide search and filters while the collection is empty`);
workflow `38270276874` — build + deploy успешно; deployment record — тот же
SHA; `CACHE_VERSION = alsavi-shell-e980bc0fd662`. Production проверен только
на чтение (данные не создавались и не менялись): бандл `index-CJ5O7rAq.js`,
форма с новыми полями, пустая коллекция — только CTA, консоль без ошибок,
без горизонтального скролла.

**Наблюдение (не дефект TASK_023, не исправлялось).** Сразу после деплоя
обычная перезагрузка показала прежний бандл: навигация в `sw.js` —
network-first через `fetch(request)`, который уважает HTTP-кэш GitHub Pages
(`cache-control: max-age=600`), а страница открывалась за ~2 мин до этого.
Обновление доходит до пользователя в пределах 10 минут (как у прошлых
деплоев); проверка выполнена с уникальным query-параметром. Если нужно
мгновенное обновление после деплоя — отдельная задача на SW
(`fetch(request, { cache: 'no-cache' })` для навигаций).

---

## 2026-09-14 — TASK_022: «Учиться сегодня» — главный экран и учебная сессия

**Сделано.** Главный учебный поток доведён до законченного состояния:
открыть приложение → увидеть план на сегодня → пройти карточки → понятный
итог. Доработка существующих `ReviewSession.tsx`/`StudySession`, без второго
планировщика и без ручного расчёта интервалов в UI. Полный разбор —
`tasks/TASK_022.md`; коротко:

- **`StudySession.overview()`** (новый read-only метод, `packages/engine`) —
  `{newCount, learningCount, reviewCount, total, newWithheld}`, тот же
  `selectEligible()`, что у `nextCard()`/`dueCount()` — главный экран не
  может разойтись с сессией, которую запускает.
- **`ReviewFlowController`** (`apps/web/src/review-flow.ts`, новый) — чистый
  TS, не React-хук: состояние-машина сессии (`loading → active ⇄ saving →
  empty|finished`). Синхронный переход в `'saving'` до первого `await` +
  счётчик `generation` — двойной клик/медленный IndexedDB не может показать
  или записать одну карточку дважды. Ошибка сохранения возвращает в
  `'active'` с той же карточкой и сообщением, `done` не растёт, оценка не
  засчитывается. Каждый интервал на кнопках — из `engine.previewIntervals()`.
- **`ReviewHome.tsx`** (новый) — 3 счётчика + общее число + «Начать
  обучение»; отдельные состояния «коллекция пуста» (призыв добавить первую
  карточку) и «на сегодня всё» (с уточнением про дневной лимит, если это
  причина). Без терминологии FSRS/IndexedDB/Scheduler.
- **`ReviewSession.tsx`** переписан вокруг контроллера
  (`useSyncExternalStore`): прогресс «N из M» + progress-bar, метка «Не
  помню» (была «Снова»), экран завершения (число повторов/новых + кнопка на
  главный), `aria-label` на кнопках оценок, `role="progressbar"`, кнопки
  оценок `disabled` во время сохранения. Space/Enter — показать ответ или
  «Хорошо»; 1–4 — явные оценки; игнорируются вне поля видимости/в полях
  ввода/во время сохранения.
- **`App.tsx`** — вкладка «Повторение» получила под-состояние `home ⇄
  session`; `StudySession` остаётся тем же долгоживущим экземпляром
  (bury-состояние не сбрасывается переключением экранов/вкладок).
- **Найденный и исправленный баг** (до коммита, обнаружен вручную в
  браузере): ветки `'empty'`/`'finished'` контроллера не обновляли
  `progress.done`, из-за чего **последний** ответ сессии не поднимал
  видимый счётчик — статбар приложения («К повторению») оставался
  устаревшим после последней карточки без перезагрузки. Закрыт (обе ветки
  теперь явно выставляют `progress`) и закреплён регрессионным тестом.

**Тесты и проверки.** `packages/engine` +6 (`overview()`), `apps/web` +13
(`ReviewFlowController`, включая перезагрузку через второй `DexieStore` над
той же IndexedDB). `npm test` — **200/200** (engine 89, anki-import 18+1
skipped, backup 16, ai 13, cli 23, web 40). `tsc --noEmit` чист в обоих
пакетах. `git diff --check` чист. `npm run build` (тот же шаг, что в CI) —
чист.

**Ручная проверка в браузере (dev-сервер, localhost).** Новая карточка →
Learning Steps (повторное появление через learn-ahead после «Не помню») →
дальнейшие оценки клавишей-цифрой и мышью → завершение сессии с верным
итогом. Перезагрузка **посреди** сессии (карточка показана, не оценена) —
ничего не потеряно, счётчик ревью не изменился. Перезагрузка **после**
завершения — без дублирования ревью, статбар верный. Пустая коллекция →
явный призыв добавить первую карточку → переход к форме добавления работает.
Мобильные ширины 320/375/390/430px — без горизонтального скролла
(`scrollWidth<=innerWidth` проверено JS на каждой ширине), сетка кнопок
оценок переключается на 2×2 ниже 380px. Тестовые карточки удалены из
общего профиля dev-сервера по завершении проверки.

**Решения и почему.**
- `overview()` как метод `StudySession`, не `LearningEngine` — категоризация
  уже отобранных карточек по `state` остаётся session-политикой (принцип
  «минимальный публичный API ядра», ARCHITECTURE.md §3.8); Engine не
  расширялся.
- `ReviewFlowController` — обычный класс с `subscribe`/`getState`, а не
  React-хук: тестируется напрямую реальными `LearningEngine`/`StudySession`/
  `MemoryStore` (как `DexieStore` в `add-note-dexie.test.ts`), без React
  Testing Library — той же инфраструктуры в проекте по-прежнему нет
  (см. решение TASK_020), и вводить её ради одного экрана посчитано лишним.
- `StudySession` остаётся одним долгоживущим экземпляром на приложение —
  переключение между `home`/`session` не пересоздаёт его, bury/лимит-
  состояние не теряется; прогресс «N из M» — локальное UI-состояние
  контроллера, а не свойство `StudySession`.

**Отложено и почему.** Cloudflare, авторизация, синхронизация, AI Layer,
изменение FSRS/второй Scheduler — не в рамках задачи, не начинались.

**Следующий шаг.** Коммит, пуш в `origin/main`, дождаться авто-деплоя
GitHub Pages, проверить production.

---

## 2026-09-14 — TASK_021: note creation failed where `crypto.randomUUID()` is unavailable — fixed

**Сделано.**
- **Проблема подтверждена воспроизведением**, не предположением. Dev-сервер,
  в странице удалён `Crypto.prototype.randomUUID` (имитация non-secure
  context / iOS Safari < 15.4): «Добавить карточку» → консоль
  `Uncaught (in promise) TypeError: crypto.randomUUID is not a function`,
  запись в IndexedDB **не появилась**, UI **ничего не показал** (форма молча
  осталась заполненной). Точная причина: `packages/engine/src/engine.ts`
  дефолтный `newId = () => crypto.randomUUID()` вызывался в `addNote()` до
  `putNote` (и в `review()` до `appendReview`); `CardManager.add()` без
  `try/catch`, rejection отбрасывался `void add(e)`. Та же причина в миграции
  v1→v2 `apps/web/src/dexie-store.ts`.
- **Фикс (Engine + UI):** новый `packages/engine/src/ids.ts` — `generateId()`:
  `crypto.randomUUID()` при наличии → иначе RFC 4122 v4 UUID из
  `crypto.getRandomValues()` (тот же канонический формат, 122 бита
  случайности) → иначе `throw` с понятным сообщением. `Math.random()` не
  используется. `engine.ts`: `options.newId ?? generateId`; `index.ts`
  экспортирует `generateId`; `dexie-store.ts` миграция использует его же.
  `CardManager.tsx`: `try/catch` вокруг `addNote`, ошибка показывается под
  формой («Не удалось сохранить карточку: …»), текст в полях сохраняется,
  поля очищаются только после успеха, кнопка `disabled` на время сохранения.
- **Тесты:** `packages/engine/test/ids.test.ts` (+9), `apps/web/test/add-note-dexie.test.ts`
  (+3, реальная запись в fake-IndexedDB через `DexieStore` с дефолтным
  генератором, чтение новым экземпляром адаптера = перезагрузка,
  сосуществование старых и fallback-id). `npm test` — **180/180** (engine 83,
  anki-import 18+1 skipped, backup 16, ai 13, cli 23, web 27). `tsc --noEmit`
  чист (engine, web). `git diff --check` чист.
- **Ручная проверка в браузере (dev-сервер, локальные данные):** с
  `randomUUID` — добавлено; без `randomUUID` — добавлено через fallback, id в
  формате v4, новых ошибок в консоли нет; без обоих источников — ошибка видна,
  текст сохранён, счётчик не изменился; после перезагрузки страницы все записи
  на месте, id fallback-заметки неизменен.
- Задача оформлена: `tasks/TASK_021.md`.

**Решения и почему.**
- Без источника случайности — `throw`, а не `Math.random`: id — постоянные
  ключи, тихая коллизия хуже видимого отказа; UI теперь показывает ошибку.
- Fallback повторяет формат `randomUUID` → старые и новые id неразличимы,
  ничего не мигрируется, существующие id не трогаются.
- Тест-изоляция Dexie в `add-note-dexie.test.ts`: сбрасывается и
  `globalThis.indexedDB`, и `Dexie.dependencies.indexedDB` (Dexie берёт
  зависимость при создании экземпляра, а не из `globalThis` — ограничение,
  уже задокументированное в `settings-migration.test.ts`).
- Окружение: `node_modules` был установлен под x64-Node; на arm64-Node
  тесты падали (`@rollup/rollup-darwin-arm64` отсутствует). Восстановлено
  `npm install` по существующему lockfile с временным `--cache`;
  `package-lock.json` не изменился.

**Отложено и почему.** Обработка ошибок в `remove()`/импорте — вне рамок
задачи (одна цель). Новая функциональность/AI Layer не начинались.

**Следующий шаг.** По плану владельца (roadmap `M1`); TASK_021 закрыта.

---

## 2026-07-27 — TASK_020: commit, push, and automatic GitHub Pages deployment verified

**Commit:** `5775fb9a9ddc2acc9310ac41817fd3b82b72571b` (`feat(study): add configurable daily new-card limit`), pushed to `origin/main`.

**Deployment.** The push automatically triggered the existing `Deploy ALSAVI to GitHub Pages` workflow (no manual deploy step — same pre-existing mechanism as prior deploys). Workflow run `30261902150`: `build` and `deploy` jobs both completed successfully. The GitHub Pages deployment record confirms the exact deployed commit: `5775fb9a9ddc2acc9310ac41817fd3b82b72571b`.

**Read-only production verification.** The production URL returned HTTP 200. The deployed `sw.js`'s `CACHE_VERSION` contains `5775fb9a9ddc`, confirming the live build matches this exact commit (not a stale cache). No production user data was touched or modified by this verification. **Interactive production UI verification (exercising the new daily-limit feature live) was not performed** — this entry confirms only that the correct build is deployed and reachable, not that its functionality was checked in production.

---

## 2026-07-27 — TASK_020: pre-commit audit + three corrections — implementation complete, awaiting owner approval for commit/push/deploy

**Контекст.** Before any commit, an independent pre-commit audit of the
TASK_020 diff (git-state verification + direct code reading, not just report
review) was performed and found three real gaps, none previously reported.
The owner authorized fixing all three within TASK_020's existing scope (no
new features, no architecture reopened) before commit is considered. This
entry records those corrections; see the entry below for the original
implementation.

**1. `StudySession` policy input validation (was: silent, buggy for
fractional values).**
- Problem confirmed: `setNewCardsPerDay`/`newCardsPerDay` accepted any
  `number`. A fractional limit (e.g. `1.5`) let **one extra new card
  through** beyond the stated limit, because the withheld-count loop in
  `selectEligible` decrements the remaining allowance by whole `1` per
  admitted card against a fractional starting value. Negative values
  silently clamped to "block all" with no error.
- Fix: `packages/engine/src/study-session.ts` — one shared, private
  `normalizeNewCardsPerDay` path used by both the constructor and the setter.
  `null`/`undefined` → unlimited; anything else must be a finite,
  non-negative integer, else `RangeError`. An invalid `setNewCardsPerDay`
  call throws before any assignment, so the previously active valid policy
  is left untouched (verified by test). New export
  `assertValidNewCardsPerDay(value)` (also from `packages/engine/src/index.ts`)
  exposes the identical check to callers that need to validate *before*
  persisting, without touching a live session.
- Tests added: 11 new cases (`packages/engine/test/study-session.test.ts`'s
  `newCardsPerDay validation` block + a dedicated `assertValidNewCardsPerDay`
  block) — fractional/negative/`NaN`/`Infinity` constructor option and setter
  both throw `RangeError`; omitted option normalizes to unlimited; an invalid
  setter call leaves the prior valid limit and bury state untouched; valid
  `null`/`0`/positive integer continue to work.

**2. Bootstrap settings-load failure (was: infinite loading, no error, no
retry).**
- Problem confirmed: the mount effect had no `.catch()` on
  `store.getNewCardsPerDay()`. A rejection left `settingsReady` permanently
  `false` — the app would stay on the neutral loading placeholder forever,
  with no visible error and no way for the user to recover.
- Fix: `apps/web/src/App.tsx` — replaced the boolean gate with
  `BootstrapState = 'loading' | 'ready' | 'error'`. `loadSettings` (used both
  on mount and by a "Повторить" retry button) sets `'error'` on rejection
  instead of leaving the state ambiguous; it never falls back to unlimited.
  The review view shows a distinct blocking message
  ("Не удалось загрузить настройки обучения.") with the retry button in the
  `'error'` state; `ReviewSession` is not rendered (so `nextCard()`/answering
  are unreachable) until `'ready'`, which is only reached after
  `session.setNewCardsPerDay(resolvedValue)` has actually run.
- Manual verification (see §4 below) confirmed the full failure → retry →
  success cycle.

**3. Runtime setting update (was: optimistic, could silently diverge from
persisted storage on save failure).**
- Problem confirmed: `onLimitChange` updated `StudySession` and the displayed
  value *before* the Dexie write even started, with no `.catch()` on the
  persistence call. A save failure would leave the UI and the live session
  reflecting a value that was never actually persisted — invisible to the
  user, and reverting on the next reload without warning.
- Fix: `apps/web/src/App.tsx` — reordered to validate
  (`assertValidNewCardsPerDay`) → persist (`store.setNewCardsPerDay`) → only
  on success apply `session.setNewCardsPerDay` + update the displayed value +
  refresh stats. On failure, nothing above runs — the previous value stays
  fully active in storage, in `StudySession`, and in the UI — and
  `apps/web/src/CardManager.tsx` shows a local error
  ("Не удалось сохранить дневной лимит.") next to the control, which is
  `disabled` while a save is in flight (preventing overlapping saves).
  `StudySession` is never reconstructed; bury state is never touched.

**4. Manual verification of the failure paths — done, on isolated local
dev-server data.** Since these are genuine async-failure paths that cannot
be forced through the normal UI, they were tested by temporarily adding a
`localStorage`-gated throw inside `DexieStore.getNewCardsPerDay`/
`setNewCardsPerDay` (and a temporary call-trace hook to diagnose an unrelated
browser-automation quirk — see below), driving the failure and retry
scenarios, then **fully reverting both temporary hooks** before finalizing
the diff — confirmed by `git diff --stat` on the touched files matching their
pre-hook byte-for-byte baseline.
- Load failure: reload with the hook active → distinct error message shown,
  no card, no `Показать ответ`/answer buttons rendered at all (`ReviewSession`
  not mounted). Clicking "Повторить" while still failing → stays in the error
  state (no infinite-loading regression, no silent unlimited fallback).
  Clearing the hook and retrying → normal study flow resumes immediately,
  correct limit still enforced, no `StudySession` reconstruction needed.
- Save failure: attempted to change the limit while the hook was active →
  local error shown, input control re-enabled after the failed attempt, and
  — confirmed directly by reading the persisted value with a fresh
  `DexieStore` instance — **the old value remained persisted**, untouched.
  Clearing the hook and retrying with a new value → persisted value updated
  correctly, error cleared.
- Re-confirmed after the fixes: `0` and unlimited (empty input) still persist
  and apply correctly (not just the positive-integer case).
- **Incidental finding, not a TASK_020 defect:** this sandboxed browser pane
  does not reliably grant the page real OS-level input focus, so scripted
  `element.focus()`/`.blur()` calls do not always dispatch native focus/blur
  events (`document.activeElement` updates, but no event fires) — a property
  of the test environment, not of the shipped code. Dispatching a genuine
  bubbling `focusout` event directly is the reliable way to trigger a React
  `onBlur` handler when driving this app's UI via injected scripts in this
  environment; noted here for any future manual browser-driven verification
  in this same sandboxed pane.

**5. Re-verification after corrections.**
- `npm test` — **168/168** across all workspaces (engine 74 [63 before these
  corrections, +11 new — see prior entry for the 63 baseline], anki-import
  18+1 skipped [pre-existing, unrelated], backup 16, ai 13, cli 23, web 24).
- `npx tsc --noEmit` — clean for `packages/engine` and `apps/web`.
- `git diff --check` — clean.
- `git status --short` / `git diff --cached --name-status` — 13 tracked
  files modified, 3 untracked new files, **nothing staged**. (Corrects the
  self-contradictory "changes staged only in the filesystem" wording from an
  earlier chat-only summary of this same state — nothing was ever staged.)

**6. Files changed by these corrections, in addition to the original
implementation diff:** `packages/engine/src/study-session.ts` (validation),
`packages/engine/src/index.ts` (new export), `packages/engine/test/study-session.test.ts`
(+11 tests), `apps/web/src/App.tsx` (bootstrap error state, transactional
update), `apps/web/src/CardManager.tsx` (`limitSaving`/`limitSaveError`
props + disabled control), `tasks/TASK_020.md`, this file.

**7. Still not committed, pushed, or deployed.** Per task constraints,
stopping here to await a separate, explicit owner instruction.

---

## 2026-07-27 — TASK_020: Enforce configurable daily new-card introduction limit — implementation complete, awaiting owner approval for commit/push/deploy

**Контекст.** Owner-approved first slice of `M1: Daily Study Controls`
(`docs/ROADMAP_ALSAVI_BETA.md`), scoped down from a dedicated multi-round
analysis-only session (repository verified clean, HEAD `29c1ee7`, in sync with
`origin/main`, before any implementation began). Full `M0` was found
premature (per the `TASK_019` M0 evaluation, reused here); `StudyService`/
`SettingsService` were **not** created — the daily-limit policy is delivered
as `StudySession` presentation policy, which the **Accepted**
`docs/adr/ADR-003-studysession-separation.md` already authorizes
("будущие дневные лимиты ... как опции/стратегии `StudySession`"). A
`StudyService` that only delegated to `StudySession` would have been a pure
pass-through wrapper, which the **Proposed** (non-binding)
`docs/adr/ADR-005-application-services-layer.md` itself warns against.
`ADR-005` is unaffected and remains `Proposed`. Full rationale, product
semantics, and scope: `tasks/TASK_020.md`.

**1. Product semantics implemented.**
- `new cards/day`: max unique cards whose **first review** is recorded today
  with `stateBefore === 'new'` — *cards first answered today*, not first
  *shown*. Counting is by unique `cardId` (defensive against inconsistent/
  imported history double-charging one card).
- `null` = unlimited (default; also what an absent persisted setting reads
  back as); `0` = zero new cards today; positive integer = that day's
  allowance. `0` is never treated as falsy — normalization is `?? null` only
  on `null`/`undefined`, never `||`/`!value`.
- Learning/relearning cards are never restricted by this limit.
- Day boundary: local calendar midnight, the same `startOfLocalDay` semantics
  `getStats().reviewsToday`/streak already use.
- Known, accepted v1 limitation: showing a new card without answering it does
  not consume allowance (usage is derived from the Review Log, which only
  records answered reviews).

**2. Architecture — implemented in `packages/engine`.**
- `LearningEngine.countNewCardsAnsweredSince(dayStart)` (`packages/engine/src/engine.ts`)
  — new, minimal, read-only: unique-`cardId` count of reviews with
  `reviewedAt >= dayStart && stateBefore === 'new'`. Derived, not persisted.
- `StudySession` (`packages/engine/src/study-session.ts`): new
  `newCardsPerDay?: number | null` option (`undefined` -> `null` via `??`) and
  `setNewCardsPerDay(limit)` narrow setter (updates policy for the *next*
  selection; no reconstruction; ephemeral bury state untouched).
  `selectEligible()` now also returns `newWithheld` (new cards held back by
  the limit), backing the new `newCardsWithheldByLimit()` method — derived
  from the exact same selector as `nextCard()`/`dueCount()`, so a UI can tell
  "nothing eligible" from "new cards exist but are limited" without risk of
  disagreement. `EngineStore` and the FSRS scheduler are **unmodified**.

**3. Persistence — `apps/web/src/dexie-store.ts`.**
- Additive Dexie `version(3)`: one `settings` table (`key -> value`) in the
  existing `AlsaviDB`, no migration of `notes`/`cards`/`reviews`. Verified
  against a simulated pre-TASK_020 (version-2-only) database that existing
  rows survive the upgrade untouched.
- `DexieStore.getNewCardsPerDay()`/`setNewCardsPerDay()` — narrow accessor
  methods on the same class/connection as the `EngineStore` implementation,
  but **outside** the `EngineStore` interface (no structural access from
  `LearningEngine`/`StudySession`). `replaceAll` (backup restore) is
  **unchanged** — still only touches `notes`/`cards`/`reviews` — so restore
  cannot reset the setting; verified by test and by manual restore (below).
  Backup schema stays `BACKUP_VERSION = 1`; settings are not part of backup
  v1; old backup files remain fully compatible.

**4. Safe initialization gate — `apps/web/src/App.tsx`.**
`ReviewSession.nextCard()` was previously called unconditionally on mount,
before any async settings load could complete — a persisted `0` or an
already-exhausted limit could have briefly behaved as unlimited. Fixed with a
`settingsReady` boolean: `ReviewSession` is not rendered (and the study
`dueCount()` used for the stats bar is not read) until the persisted setting
has been loaded and applied via `session.setNewCardsPerDay(...)`. Runtime
changes (via the new UI control) call the same setter immediately, without
reconstructing `StudySession` — bury state is never at risk.

**5. UI — three distinguishable states (`ReviewSession.tsx`), one minimal
control (`CardManager.tsx`).**
- Existing "Всё повторено. 🎉" unchanged for "nothing eligible at all".
- New distinct message ("Дневной лимит новых карточек достигнут…") shown only
  when new cards exist but are withheld and nothing else is eligible —
  derived from `newCardsWithheldByLimit()`, so it can never fire falsely when
  there simply are no new cards.
- Due review/learning/relearning cards continue normally once the new limit
  is reached; no terminal state is shown in that case.
- One small numeric input ("Новых карточек в день:") next to the existing
  backup controls in `CardManager`; empty = unlimited, `0` or a positive
  integer = the limit. No settings-screen redesign.

**6. Tests.**
- `packages/engine`: 63/63 green (was 45; +18: `countNewCardsAnsweredSince` in
  `engine.test.ts`, the full daily-limit behavior suite in
  `study-session.test.ts` — unlimited/`0`/positive limit, unique-card
  counting incl. a defensive duplicate-review-record case, day-boundary
  exclusion, learning/relearning unaffected, showing without answering,
  setter runtime-update without reconstruction or bury loss, and session
  reconstruction recovering allowance from the persisted log).
- `apps/web`: 24/24 green (was 19; +5: `settings-store.test.ts` — absent
  setting reads as unlimited, `null`/`0`/positive round-trip, survives
  adapter reconstruction, `replaceAll` doesn't reset it;
  `settings-migration.test.ts` — additive `version(3)` upgrade preserves a
  simulated pre-TASK_020 database's notes/cards).
- **Honest limitation, not silently skipped:** this repository has no
  React component-testing infrastructure (no jsdom/React Testing Library —
  `apps/web/vitest.config.ts` runs `environment: 'node'`, and existing web
  tests are all headless `.test.ts` files, e.g. `ordering.test.ts`). Adding
  one was judged out of this task's scope (new tooling, not a narrow feature
  change). The initialization-gate and three-UI-state behaviors in
  `App.tsx`/`ReviewSession.tsx` therefore have **no automated component-level
  test** — they were verified **manually** instead (next section). This is a
  deviation from `tasks/TASK_020.md`'s literal "Initialization/UI" test list,
  recorded here rather than overclaimed.

**7. Manual verification — done, on isolated local dev-server data (not
production data).** Local dev server (`localhost:5173`), fresh IndexedDB:
- Empty collection -> "Всё повторено. 🎉" (state 1) rendered correctly.
- Added two new cards, set limit to `1` via the new control -> "К повторению"
  immediately dropped from 2 to 1, confirming persist + runtime
  `setNewCardsPerDay` + stats refresh all wired correctly.
- Answered the one allowed card ("Хорошо") -> it resurfaced once via
  learn-ahead (state `изучается`, unrelated existing behavior, correctly
  **not** re-counted against the limit); answered it again ("Легко") to
  graduate it out -> UI then showed the **distinct** "Дневной лимит новых
  карточек достигнут" message (state 2), not the generic empty-state message.
- Full page reload: the persisted limit (`1`, already exhausted) was honored
  immediately on the very first render — no unlimited flash, no incorrect
  card shown.
- Restore (synthetic valid backup, `window.confirm` stubbed to approve, same
  mechanism `TASK_019` unified): after "Восстановлено: 1 заметок, 1 карточек,
  0 повторений", the daily limit input still read `1` (setting preserved)
  while "Сегодня"/usage correctly reset to reflect the restored (empty)
  review log — exactly the specified restore contract.
- `0` and cross-check of engine-level counting rules were **not** re-verified
  manually beyond this (already exhaustively covered by the 18 new headless
  engine tests); judged sufficient rather than redundant.

**8. Code-level verification.**
- `npm test` — **157/157** across all workspaces (engine 63, anki-import
  18+1 skipped [pre-existing, unrelated], backup 16, ai 13, cli 23, web 24).
- `npx tsc --noEmit` — clean for `packages/engine` and `apps/web`.
- `git diff --check` — clean.
- Diff scope confirmed to match `tasks/TASK_020.md`'s "In scope" exactly:
  `packages/engine/src/{engine,study-session}.ts`,
  `packages/engine/test/{engine,study-session}.test.ts`,
  `apps/web/src/{App,CardManager,ReviewSession,dexie-store}.tsx?`,
  `apps/web/src/styles.css`, `apps/web/test/settings-{store,migration}.test.ts`
  (new), `tasks/TASK_020.md` (new), plus this entry, `ARCHITECTURE.md`, and
  `docs/ROADMAP_ALSAVI_BETA.md`. `packages/backup`, `packages/ai`,
  `packages/anki-import`, `apps/cli` — **untouched**.

**9. ADR / roadmap.**
- `ADR-005` remains `Proposed` — unchanged. No new ADR created (per the
  analysis session's finding that `ADR-003`, Accepted, already covers placing
  daily-limit policy in `StudySession`).
- `docs/ROADMAP_ALSAVI_BETA.md` M1 section updated with an explicit "Update
  (TASK_020, owner-approved deviation)" clause recording that this slice
  bypassed the literal `M0 → StudyService + SettingsService` breakdown, and
  why, so the roadmap and the implementation no longer silently disagree.
- `ARCHITECTURE.md` §6/§5 updated: `StudySession`'s daily-limit policy and
  `countNewCardsAnsweredSince` documented as implemented; removed from the
  "Future Architecture" list (§12), replaced with the still-open
  `max-reviews/day`/undo items.

**10. Deviations from `tasks/TASK_020.md` (recorded, not hidden).**
- No automated component-level test for the initialization gate / three UI
  states (§6 above) — manual verification substituted, given no existing
  React-testing infrastructure in this repo.

**11. Follow-up observations (non-blocking, not folded into this task's scope).**
- `max-reviews/day` counting semantics remain undefined in any committed
  document — needs a product decision before the next M1 slice.
- Undo ADR still not created (roadmap: "ADR first").
- `TASK_019`'s manual-verification branches A/B (native file picker) remain
  unconfirmed — unrelated to this task.
- Adding React component-testing infrastructure (jsdom + React Testing
  Library or similar) would let the initialization-gate/three-state UI logic
  be covered by automated tests instead of manual-only verification — a
  reasonable, separate future improvement, not required by this task.

**12. Final working tree status.** All changes are made and verified but
**not committed**. Per task constraints: no commit, push, or deploy without a
separate, explicit owner instruction.

---

## 2026-07-22 — TASK_019: Unify Safe Backup Restore Orchestration — implementation done; manual verification partial

**Контекст.** Owner-approved, ограниченный follow-up сессии оценки M0
(`docs/ROADMAP_ALSAVI_BETA.md`, milestone «M0 — Services layer + Module
Seam»). Та оценка нашла, что полный M0 сейчас преждевременен (большинство из
семи предложенных сервисов либо уже существуют как независимые пакеты
(`@alsavi/backup`, `@alsavi/anki-import`, `AIService`), либо не имеют
текущей фичи, которая их требует; `AlsaviModule`/Domain Events не имеют
принятого ADR — `ADR-005` явно выносит этот шов за свой scope). Единственная
найденная реальная, узкая проблема — safe-restore-последовательность была
реализована дважды. **TASK_019 — это НЕ реализация полного M0**, а отдельный
ограниченный application-layer cleanup внутри уже существующей границы
`@alsavi/backup` (ARCHITECTURE.md §11b), обоснованный устранением
дублирования, а не архитектурным строительством.

**1. Implementation — завершена, в approved scope.**
- В `@alsavi/backup` (`packages/backup/src/import.ts`) введён единый headless
  restore-orchestration primitive — `restoreBackup(store, text, confirm)`.
  Порядок сохранён: **validate → confirm → atomic `replaceAll`** — разрушительная
  фаза недостижима ни на невалидном файле, ни без положительного подтверждения
  (INV-9 не ослаблен).
- Confirmation callback (`ConfirmRestore`) поддерживает
  `boolean | Promise<boolean>` — не привязан к синхронному `window.confirm`.
- Существующий `importBackup` — теперь **thin wrapper** над `restoreBackup`
  (auto-approving `confirm: () => true`); отдельной реализации
  `parseBackup → replaceAll` в пакете больше не существует.
- **Web** (`apps/web/src/CardManager.tsx`, `onRestore`) использует общий
  primitive; в React остались только чтение файла, adapter-callback к
  `window.confirm`, отображение статус-строк (формулировки не изменены) и
  `reload()`/`onChanged()`. Инлайновой `parseBackup`/`replaceAll`-логики в
  компоненте больше нет.
- **CLI** (`apps/cli/src/cli.ts`) переведён на тот же общий primitive, с
  auto-approving policy (`() => true`) — некогда interactive-подтверждения не
  было и не добавлено; сообщения об ошибках сохранены дословно.
- **Тесты**: 6 новых headless-кейсов в `packages/backup/test/backup.test.ts`
  (invalid → rejected, confirm не вызывается, store не тронут; valid + confirm
  → false → cancelled, данные целы; valid + sync confirm → true → restored,
  верные counts; valid + async confirm → true — тот же путь; confirm получает
  metadata без повторного парсинга; `importBackup` не изменил поведение).

**2. Code-level verification — пройдена полностью, вопросов нет.**
- Полный `npm test` по всем workspaces: **130/130** (engine 45, anki-import
  18+1 skipped, backup **16** [было 10], ai 13, cli 23, web 19).
- `npx tsc --noEmit` — чисто для `packages/backup`, `apps/web`, `apps/cli`.
- `git diff --check` — чист.
- Diff ограничен ожидаемыми файлами: `apps/cli/src/cli.ts`,
  `apps/web/src/CardManager.tsx`, `packages/backup/src/{import,index}.ts`,
  `packages/backup/test/backup.test.ts`, `tasks/TASK_019.md`. **`packages/engine`,
  `packages/ai`, `packages/anki-import` не изменялись.**

**3. Manual (browser/UI) verification — частична; разделяю подтверждённое и
неподтверждённое, без преувеличений.**

Для проверки трёх веток (invalid / valid+cancel / valid+confirm) были
подготовлены три fixture-файла вне репозитория
(`.../scratchpad/task_019_smoke/{A-invalid,B-valid-cancel-test,
C-valid-confirm-test}.json`), независимо провалидированные против реального
`parseBackup`.

- **Ветка A (invalid backup) — НЕ подтверждена физически владельцем** через
  native file picker.
- **Ветка B (valid + cancel) — НЕ подтверждена физически владельцем** через
  native file picker.
- **Ветка C (valid + confirm) — подтверждена владельцем физически** на
  локальном origin (`localhost:5173`, чистая, только что очищенная
  IndexedDB): подтверждение появилось, после подтверждения UI показал
  «Восстановлено: 3 заметок, 6 карточек, 0 повторений», появились
  соответствующие 6 карточек, данные отображаются и переживают reload. Это
  подтверждает, что **end-to-end механизм (валидация, подтверждение, замена,
  отображение восстановленных данных) реально работает.**
  - **Но не на подготовленном fixture.** Восстановленный датасет (3
    заметки/6 карточек/0 повторений) точно совпал (побайтово, включая тексты
    заметок) с реальным существующим файлом `~/Desktop/alsavi-backup-2026-07-21.json`
    — а не с подготовленным `C-valid-confirm-test.json` (2 заметки/3
    карточки). Этот Desktop-файл — реальный личный бэкап-снимок (одна из
    промежуточных выгрузок GitHub-Pages Day-0 сессии, задокументированной
    выше в этом файле), не относится к репозиторию и не был изменён в рамках
    TASK_019.
  - Изначальная browser-automation аномалия (тот же 3/6/0-датасет,
    полученный ранее при попытке агента через синтетический
    `DataTransfer`) **не указывает на code defect** — тот же самый реальный
    Desktop-файл был точно идентифицирован как содержимое, которое
    восстановилось. **Причина, по которой file picker/automation выбрал
    именно этот файл дважды, окончательно не доказана** — версия
    (файл лежит там, куда диалог выбора файла подставляет
    default/last-used путь) остаётся гипотезой, не фактом.

**Ветки A и B покрыты headless automated-тестами** (см. п.1) — эквивалентная
логика (`rejected`/`cancelled`) верифицирована детерминированно на уровне
кода, но **не** физическим прохождением через native file picker.

**Manual verification НЕ засчитывается как полное прохождение всех трёх A/B/C
веток.** Ветка C подтверждает работоспособность механизма, но не на
предполагавшемся fixture; A и B остаются физически неподтверждёнными.

**4. ADR / roadmap.**
- `ADR-005` **остаётся `Proposed`** — не изменён на `Accepted`. Реализация
  одного ограниченного increment'а не равна принятию решения о слое Services
  целиком.
- Новый ADR не создавался — задача осталась внутри уже существующей границы
  `@alsavi/backup`/`EngineStore`.
- Конфликт roadmap ↔ ADR-005 по `AlsaviModule`/Domain Events **не решался** в
  этой задаче — остаётся в Follow-up (см. отчёт M0-оценки этой же сессии).

**5. Решения и почему.**
- Единый primitive вместо второго `BackupService`-класса — минимально
  необходимое устранение дублирования, без создания нового яруса/пакета
  (см. отклонённый в M0-оценке риск преждевременной абстракции).
- Manual-verification аномалия **не привела к правке кода** — нет
  воспроизводимого доказательства implementation-дефекта; правка кода без
  такого доказательства была бы неоправданной.

**6. Отложено и почему.**
- Физическое прохождение веток A и B через native file picker — ожидает
  повторной попытки владельца с явной проверкой выбранного файла в диалоге
  (рекомендация: временно убрать/переименовать
  `~/Desktop/alsavi-backup-2026-07-21.json` с default-пути перед повтором,
  либо явно вводить путь к fixture).
- Полное объяснение первоначального file-selection mixup — не доказано,
  зафиксировано как открытый follow-up, не как решённый факт.
- Полный `M0: Services Layer + Module Seam`, `AppDataRepository`,
  `AlsaviModule`/Domain Events — вне scope этой задачи (см. TASK_019.md
  «Out of scope»).

**7. Следующий шаг.**
- Повторное физическое прохождение веток A/B (и, при желании, повторно C —
  уже на подтверждённом fixture-файле) через native file picker, с явной
  проверкой выбранного файла перед подтверждением.
- **Commit, push и deploy — не выполнены**; ожидают отдельного явного
  разрешения владельца.

## 2026-07-22 — TASK_019: commit, push, and GitHub Pages deployment (owner-approved)

**Решение основателя.** Основатель рассмотрел итоговый отчёт сессии TASK_019
(implementation + code-level verification + честно зафиксированный partial
manual-verification статус выше) и утвердил фиксацию в repository: commit,
push, deploy, safe read-only production verification. **Формулировка
manual-verification статуса, зафиксированная выше, не менялась и не
переписывалась** — эта запись только добавляет commit/deploy/production
evidence, поверх уже зафиксированного.

**1. Pre-commit re-verification (повторно, непосредственно перед commit).**
Полный `npm test` — **130/130** по всем workspaces; `tsc --noEmit` чист для
`packages/backup`/`apps/web`/`apps/cli`; `git diff --check` чист; diff
ограничен теми же 7 файлами (`PROGRESS.md`, `tasks/TASK_019.md`,
`packages/backup/src/{import,index}.ts`,
`packages/backup/test/backup.test.ts`, `apps/web/src/CardManager.tsx`,
`apps/cli/src/cli.ts`); `packages/engine`, `packages/ai`,
`packages/anki-import`, scheduler, persistence-архитектура, ADR-файлы —
не тронуты. Blocking-проблем не найдено.

**2. Commit.** `5ea36ab23b9dd8a3f63fc1dbbc847be4e1e9220c` —
`refactor(backup): unify safe backup restore orchestration`. Staged
исключительно перечисленные выше 7 файлов.

**3. Push.** `git push origin main` — успешно
(`7662fc3..5ea36ab main -> main`); локальный `main` и `origin/main`
синхронизированы на `5ea36ab`.

**4. Deploy.** Push затронул пути `apps/web/**`/`packages/**`, что по
существующему `.github/workflows/deploy-pages.yml` **автоматически** (без
изменения deployment-конфигурации) запустило workflow `29899922691` — build
29s (включая `npm test` в CI) + deploy 9s, оба ✓; единственные annotations —
безобидные Node20→24-deprecation-предупреждения от самих GitHub-экшенов (как
и в TASK_018). GitHub Pages deployment API (`gh api
repos/adar4026/ALSAVI/deployments`) подтверждает: последний deployment id
`5551425582`, environment `github-pages`, **`sha:
5ea36ab23b9dd8a3f63fc1dbbc847be4e1e9220c`** — совпадает с новым коммитом.
gh-pages-ветки нет (build_type: workflow, как и раньше) — deployment record
и есть authoritative evidence вместо gh-pages-коммита.

**5. Production verification — только безопасная, read-only, как и было
разрешено.** Проверено на `https://adar4026.github.io/ALSAVI/`:
- прямой запрос `/sw.js` (`cache: no-store` эквивалент через `curl`)
  показывает `CACHE_VERSION = alsavi-shell-5ea36ab23b9d` — совпадает с
  `git rev-parse --short=12` нового коммита, т.е. задеплоен именно
  закоммиченный код;
- приложение открывается, рендер корректен, консоль чистая (0 ошибок);
- обе вкладки («Повторение», «Карточки») открываются и работают;
- на экране карточек видны кнопки «Импорт из Anki (.apkg)», «Экспорт
  (резервная копия)», «Восстановить из копии»;
- сетевые запросы (JS/CSS ассеты) — 200, без 404.
- **Restore backup, import `.apkg`, добавление/удаление карточек — НЕ
  выполнялись на production.** Никакие реальные данные основателя не
  затрагивались и не изменялись. Синтетическая file-input-automation на
  production не использовалась.

**6. Ограничения, сохраняющиеся без изменений (см. запись выше).** Ветки
manual-verification A (invalid backup) и B (valid + cancel) **по-прежнему не
подтверждены физически** через native file picker — покрыты только headless
automated-тестами. Ветка C (valid + confirm) подтверждена физически
основателем локально, но не на подготовленном fixture (см. подробности
выше) — **это не переоценивается и не превращается в полный manual PASS**
этой записью. Причина изначального file-selection mixup по-прежнему не
доказана.

**Статус.** TASK_019 зафиксирован в `main` и задеплоен на production.
`ADR-005` остаётся `Proposed`. TASK_019 — ограниченный application-layer
cleanup, не реализация полного `M0: Services Layer + Module Seam`; конфликт
roadmap↔ADR-005 по `AlsaviModule`/Domain Events остаётся в Follow-up,
не тронут этой записью.

## 2026-07-21 — Owner decision: GitHub Pages durability observation CANCELLED BY OWNER

**Решение основателя** (2026-07-21, 22:50 +02:00). Активное 14-дневное
durability-наблюдение для GitHub Pages origin (Day 0 объявлен в записи ниже,
2026-07-21, 22:42:37, +02:00) — **отменено решением основателя**. Основание:
основатель лично, физически подтвердил на iPhone, что production-развёртывание
полностью работоспособно —
- production-приложение открывается и работает;
- запускается независимо от MacBook и локального сервера;
- Add to Home Screen работает;
- backup export/import и восстановление данных IndexedDB работают на
  production origin.

При этом наблюдательное окно более не требуется как условие для нормального
использования и дальнейшей разработки.

**1. Итог наблюдения — точная формулировка.**
- **Статус: `CANCELLED BY OWNER`.**
- **Это НЕ `FAIL`** — окно не показало ни full-, ни partial-эвикшн (§7
  `docs/DURABILITY_PROTOCOL_GH_PAGES.md`), потому что Day-14-проверка не
  проводилась.
- **Это НЕ `PASS`/`completed`** — байт-точное сравнение Day-0/Day-14 (§6) не
  выполнялось; протокольный «завершён» статус (§9: завершение = Day-14-проверка
  выполнена + результат зафиксирован) **не достигнут** — наблюдение остановлено
  до этого момента, по решению основателя, а не через штатное завершение
  протокола.
- **Не является доказательством 14-дневного durability-результата** ни в
  какую сторону — ни успеха, ни провала. Единственное, что фактически
  подтверждено — сохранность данных при **активном использовании** (restore
  сработал, данные видны после restore), что не эквивалентно вопросу
  протокола (переживают ли данные **простой** под iOS/WebKit
  storage-eviction).

**2. Исторические факты — сохранены без изменений (см. запись ниже, не
переписана и не удалена).**
- Day 0 (скорректированный): 2026-07-21, 22:42:37, +02:00.
- Baseline-файл: `alsavi-backup-2026-07-21.json`.
- SHA-256: `1e0a92d706576ead747dec08609c58a9d23fcad25b433aa909eda155e7805f9c`.
- Счётчики датасета: 5 заметок / 10 карточек / 0 повторений.
- Production origin: `https://adar4026.github.io/ALSAVI/`.
- Ранее запланированная Day-14-проверка: **2026-08-04, 22:42:37, +02:00** —
  **отменена этой записью**, дальше не актуальна.

**3. Действующие правила — явно.**
- **Idle-regime и zero-interaction-ограничения (`docs/DURABILITY_PROTOCOL_GH_PAGES.md`
  §5) сняты немедленно.** Приложение можно открывать без ограничений.
- **ALSAVI можно открывать, использовать, обновлять, пересобирать и
  деплоить в обычном режиме** — никаких ограничений на rebuild/redeploy
  `apps/web` со стороны этого протокола больше нет.
- **Существующий backup-файл остаётся полезным проверенным recovery-baseline**
  (checksum и счётчики зафиксированы выше) — но **никакое Day-14-сравнение
  для него больше не требуется**.
- **Активного Protocol Freeze или durability-гейта не остаётся** ни для
  `apps/web`, ни для деплоя — ни от исходного (LAN, `TERMINATED EARLY` /
  `INCONCLUSIVE`), ни от этого (GitHub Pages, `CANCELLED BY OWNER`)
  протокола.

**Статус.** Зафиксировано 2026-07-21 как отдельный коммит — авторитетная
запись отмены. Записи ниже (Day-0 declaration и всё, что им предшествует)
сохранены как историческая последовательность решений, не переписаны и не
удалены.

**Следующий шаг.** Нормальная разработка ALSAVI возобновляется без
ограничений durability-протокола. Отдельно, независимо от этой отмены —
возврат к ALSAVI Beta roadmap (M0–M6, `docs/ROADMAP_ALSAVI_BETA.md`), чья
собственная feature-completeness-гейтинг-логика (§0/§7) — отдельный,
по-прежнему открытый вопрос, не затронутый этой записью.

---

## 2026-07-21 — Backup restore verified on production; corrected Day 0 declaration (post-restore baseline)

**1. Backup import / restore на production origin — теперь owner-verified.**
Основатель выполнил на установленной production PWA (`https://adar4026.github.io/ALSAVI/`)
полный цикл создать backup → restore и подтвердил, что список карточек
присутствует после восстановления. Это закрывает пункты, ранее
зафиксированные как НЕ ПРОВЕРЕНО в записи ниже («Physical iPhone
acceptance…», 2026-07-21 22:30): **импорт бэкапа** и **сохранение
восстановленных данных** — оба теперь **owner-verified**. Полный офлайн-цикл
(закрыть → сеть off → перезапуск) и защита от дублирования при повторном
открытии (шаги 7–10, 12 исходного чек-листа) по-прежнему **не подтверждены
отдельно** — не выводятся из этого факта.

**2. Расхождение в счётчиках — зафиксировано и объяснено основателем.** В
сообщении о верификации restore основатель указал видимое состояние **3
заметки / 6 карточек / 0 повторений**. Финальный export-файл, предоставленный
следом (`alsavi-backup-2026-07-21.json`, см. §4 ниже), фактически содержит
**5 заметок / 10 карточек / 0 повторений** — проверено прямым разбором JSON
(длины массивов `data.notes`/`data.cards`/`data.reviews`), с подтверждённой
ссылочной целостностью (каждый `card.noteId` резолвится в существующую
заметку, дублей id нет). **Объяснение подтверждено основателем напрямую**
(не вывод агента): между сообщением о верификации restore и созданием
финального export основатель добавил ещё карточки, поэтому итоговый export
получился «с чуть большим количеством» — 5 заметок × 2 (forward+reverse)
карт/заметку = 10 согласуется без остатка, что соответствует добавлению
данных, а не повреждению. **Baseline ниже зафиксирован по фактическому
содержимому файла** (5/10/0) — это и есть хешируемый артефакт; исходно
названные 3/6/0 сохранены здесь как отдельно зафиксированный, объяснённый
факт, не переписаны и не отброшены.

**3. Anki `.apkg`-импорт: видимая ошибка в UI — устаревшее сообщение,
не свидетельство сбоя backup-restore.** Основатель подтвердил, что
видимая ошибка импорта `.apkg` относится к более раннему, не связанному с
backup/restore действию, и является stale UI-сообщением. **Код не менялся
в рамках этой документационной сессии** — фиксируется только как
наблюдение; исправление (если потребуется) — отдельная будущая задача.

**4. Корректировка Day 0 — прежнее объявление (22:30) SUPERSEDED.**
Создание backup + restore на установленной PWA само по себе — открытие и
активное взаимодействие с приложением, что нарушает idle-regime
(`docs/DURABILITY_PROTOCOL_GH_PAGES.md` §5: ноль взаимодействий между Day 0
и Day 14, приложение открывается только дважды). Поскольку это
взаимодействие произошло **после** ранее объявленного Day 0 (2026-07-21,
22:30, +02:00 — запись ниже), тот timestamp **не может** оставаться
валидным baseline для durability-наблюдения. Запись ниже помечена
SUPERSEDED (текст не удалён и не переписан — см. её начало).

**5. Скорректированное Day 0 declaration.**
- **Declaration timestamp (start).** **2026-07-21, 22:42:37, +02:00 (CEST)**
  — взят из `exportedAt` финального export-файла (Unix ms
  `1784666557979`), а не из показаний часов агента: это единственный
  машинно-точный момент создания baseline-артефакта.
- **Production origin.** `https://adar4026.github.io/ALSAVI/` (без изменений).
- **Deployed source SHA.** `5a2e1ff` (`5a2e1ffc86fc`) — без изменений с
  прошлой записи; повторно подтверждено (`gh run list` — единственный
  успешный deploy-run по-прежнему `29865333304`, коммитов, триггерящих
  redeploy, с тех пор не было).
- **Service Worker / cache version.** `alsavi-shell-5a2e1ffc86fc`.
- **Baseline dataset — файл.** `alsavi-backup-2026-07-21.json` (взят с
  Desktop основателя, **не** коммитится и не будет закоммичен в
  репозиторий — см. правило миграции TASK_018).
  - **Размер.** 3581 байт.
  - **SHA-256.** `1e0a92d706576ead747dec08609c58a9d23fcad25b433aa909eda155e7805f9c`.
  - **Счётчики (по факту содержимого файла — см. §2 выше).** 5 заметок, 10
    карточек, 0 повторений.
  - **`format`/`version`.** `"alsavi-backup"` / `1` — соответствует
    ожидаемой схеме `@alsavi/backup`.
- **Observation period.** 14×24 ч (336 ч) от declaration timestamp, без
  календарного подсчёта дней.
- **Computed Day-14 checkpoint.** 2026-07-21 22:42:37 +02:00 + 336 ч =
  **2026-08-04, 22:42:37, +02:00 (CEST)** (без перехода DST в окне —
  ближайший переход на зимнее время в Испании в конце октября).
- **Success / failure / completion criteria.** Без изменений —
  `docs/DURABILITY_PROTOCOL_GH_PAGES.md` §6 (успех), §7 (провал,
  full/partial), §8 (правило интерпретации, две независимые проверки), §9
  (явные completion-критерии).

**Статус.** Зафиксировано 2026-07-21 как отдельный коммит — это
авторитетная, корректирующая запись Day-0 для GitHub-Pages-протокола.
Дальнейшие изменения статуса — только через новые записи, не правкой этой.

---

## 2026-07-21 — ~~Physical iPhone acceptance (owner-verified) + Day 0 declaration: GitHub Pages durability protocol~~ SUPERSEDED (см. запись выше)

**Эта запись SUPERSEDED записью выше** («Backup restore verified on
production; corrected Day 0 declaration») — Day-0-декларация в §2 ниже
(2026-07-21, 22:30, +02:00) **больше не действительна** как baseline
durability-наблюдения: последующее взаимодействие с приложением (создание
backup + restore) произошло после этого timestamp, что нарушает
idle-regime-требование протокола. Текст ниже сохранён без изменений как
историческая запись — не переписан, не удалён.

**1. Physical iPhone acceptance — owner-verified, 2026-07-21.** Основатель
подтвердил лично, на реальном iPhone, следующее (и только это — см. границы
ниже):
- production-адрес `https://adar4026.github.io/ALSAVI/` открывается корректно;
- ALSAVI добавлен на экран «Домой» (Add to Home Screen);
- установленная PWA запускается успешно (standalone);
- приложение работает корректно и **больше не зависит от MacBook или
  локального сервера**.

**Границы подтверждения (важно, ничего не выводится по умолчанию).** Ниже —
пункты чек-листа приёмки (`PROGRESS.md`/предыдущая сессия), которые
**основатель НЕ подтвердил отдельно** и которые поэтому фиксируются как
**НЕ ПРОВЕРЕНО**, а не как пройденные:
- импорт бэкапа со старого origin (шаг 5 чек-листа) — **не подтверждено**;
- сохранение восстановленных данных после перезапуска (шаг 6, 10, 12
  чек-листа) — **не подтверждено**;
- полный офлайн-цикл (закрыть → выключить сеть → перезапустить → рендер +
  данные, шаги 7–10) — **не подтверждено**;
- отсутствие дублирования/потери данных при повторном открытии (шаг 12) —
  **не подтверждено**.

Из факта «приложение работает и не зависит от MacBook» **не выводится**
заключение об офлайн-старте, миграции данных или durability — это
отдельные, ещё не пройденные проверки.

**2. Day 0 declaration — `docs/DURABILITY_PROTOCOL_GH_PAGES.md`.** Это
формальное объявление Day 0 нового 14-дневного durability-протокола для
GitHub Pages origin, независимого от терминированного LAN-эксперимента (см.
запись «Owner decision…» ниже, статус `TERMINATED EARLY` / `INCONCLUSIVE`
остаётся в силе и не пересматривается этой записью).

- **Declaration timestamp (start).** 2026-07-21, 22:30, +02:00.
- **Production origin.** `https://adar4026.github.io/ALSAVI/`.
- **Deployed source SHA.** `5a2e1ff` (12-символьный формат `5a2e1ffc86fc`) —
  коммит `feat(deploy): migrate ALSAVI to permanent GitHub Pages PWA
  deployment`. **Подтверждено вживую** прямым запросом `/sw.js` на
  production (`cache: 'no-store'`) непосредственно перед этой записью:
  `CACHE_VERSION = 'alsavi-shell-5a2e1ffc86fc'` — совпадает. (Текущий HEAD
  репозитория на момент этой записи — `7b3b919`, docs-only коммит поверх
  `5a2e1ff`, не триггерящий redeploy по path-фильтру workflow — задеплоенный
  код по-прежнему `5a2e1ff`.)
- **Service Worker / cache version.** `alsavi-shell-5a2e1ffc86fc` (см. выше).
- **Baseline backup / dataset state — НЕ УСТАНОВЛЕНО.** По протоколу
  (`docs/DURABILITY_PROTOCOL_GH_PAGES.md` §10, шаги 3–4) перед стартом
  наблюдения должен быть создан канонический датасет на устройстве и сразу
  снят Day-0 Export. **Ни то, ни другое не было отдельно подтверждено
  основателем** в рамках этой сессии — фиксируется как **не выполнено**, а
  не молчаливо предполагается. **Следствие:** байт-точное сравнение Day-14
  (§6) в его нормативном виде **не может быть выполнено**, пока этот шаг не
  закрыт — см. «Следующий шаг».
- **Observation period.** 14×24 ч (336 ч) от declaration timestamp, не
  календарным подсчётом дней (`docs/DURABILITY_PROTOCOL_GH_PAGES.md` §5,
  наследует методологию §7 исходного протокола).
- **Computed Day-14 checkpoint.** 2026-07-21 22:30 +02:00 + 336 ч =
  **2026-08-04, 22:30, +02:00** (21 + 14 = 35 → август, 35 − 31 = 4; оба конца
  — CEST/+02:00, без перехода DST в окне).
- **Success / failure / completion criteria — верно из
  `docs/DURABILITY_PROTOCOL_GH_PAGES.md`, дословно не переписаны здесь:**
  §6 (успех — байт-точное совпадение Day-0/Day-14 Export), §7 (провал —
  full/partial eviction, две категории), §8 (правило интерпретации —
  согласие двух независимых методов проверки; при расхождении —
  `INCONCLUSIVE`, не автоматический провал), §9 (**явные, не `TBD`**
  completion-критерии: протокол завершён, когда Day-14-проверка выполнена
  и результат зафиксирован в PROGRESS.md — независимо от исхода).

**Статус.** Зафиксировано 2026-07-21 как отдельный коммит — авторитетная
запись Day-0 объявления GitHub-Pages-протокола; источник статуса —
PROGRESS.md, per конвенция проекта (см. `docs/DURABILITY_PROTOCOL_GH_PAGES.md`).

**Следующий шаг (критично для валидности эксперимента).** Датасет + Day-0
Export должны быть созданы **как можно скорее** на установленной production
PWA — до тех пор наблюдательное окно фактически идёт «вхолостую» (нет
baseline для сравнения на Day 14). Рекомендация: выполнить
`docs/DURABILITY_PROTOCOL_GH_PAGES.md` §10, шаги 3–4, и зафиксировать
отдельным дополнением к этой записи (без переписывания уже
задекларированного declaration timestamp/SHA выше).

---

## 2026-07-21 — TASK_018 (GitHub Pages production deployment) — выполнено

Основание — запись выше («Owner decision: 14-дневный durability-эксперимент
завершён досрочно…») и `tasks/TASK_018.md`. ALSAVI развёрнут на постоянном
production-адресе **`https://adar4026.github.io/ALSAVI/`**, вживую проверен.

**Сделано:**
- **Репозиторий сделан публичным** (owner-confirmed в этой сессии) — GitHub
  Pages не обслуживает private-репозитории на Free-плане; перед переключением
  проверено отсутствие секретов/ключей в истории (`git grep` по
  ключевым/паролям/PEM-паттернам — чисто, `.env`/`.pem`/`.key` не отслеживаются).
- **Base-path** (`apps/web/vite.config.ts`): `base: '/ALSAVI/'` для `build`/
  `preview`, `'/'` для локального `dev` (LAN/mkcert-сценарий TASK_015 не
  затронут; `vite preview` теперь честно проверяет тот же base, что и prod).
  `index.html` — через `%BASE_URL%` (штатный механизм Vite, не ad hoc
  rewriting); `manifest.webmanifest` — `start_url`/`scope`/иконки переведены на
  **относительные** пути (резолвятся относительно самого манифеста по спеке Web
  App Manifest — переносимо на любой base без build-time штампа);
  `registerSW.ts` — регистрация через `import.meta.env.BASE_URL`.
- **TASK_017 (полный app-shell precache) реализован** и включён в эту задачу
  (folded in, не отдельно): `apps/web/build/serviceWorkerVersion.ts` —
  `resolvePrecacheManifest`/`stampPrecacheManifest`, детерминированно (сортировка)
  собирают список файлов `dist/` (кроме `sw.js`/`index.html`, кроме `.wasm` —
  см. ниже) и стампуют в `dist/sw.js`; `install`-обработчик теперь
  `cache.addAll(['./', ...PRECACHE_MANIFEST])` вместо `cache.add('/')`.
  **Попутно найден и исправлен реальный баг** (не только TASK_017-находка): `'/'`
  в `cache.add`/`cache.match` резолвится относительно **origin root**, а не
  scope — под sub-path это кэшировало бы `https://adar4026.github.io/`, а не
  `/ALSAVI/`. Заменено на `'./'` (резолвится относительно scope SW). Подтверждено
  вживую на production (см. ниже).
- **`sql.js`-WASM (660 КБ) осознанно исключён** из eager precache
  (`PRECACHE_EXCLUDED_EXTENSIONS = ['.wasm']`) — используется только при
  ручном .apkg-импорте, не нужен для usable initial state; форсировать это на
  каждую установку противоречило бы принципу SPEED. Остаётся на runtime
  stale-while-revalidate — закэшируется при первом реальном использовании.
- **`.github/workflows/deploy-pages.yml`** — GitHub Actions
  (`actions/deploy-pages`), единственный механизм (gh-pages-пакет не введён):
  install → **`npm test`** (все workspaces) → `npm run build` → `.nojekyll` →
  upload → deploy. Pages включён через `gh api` с `build_type=workflow`.
- **`.gitignore` ужесточён**: узкие root-scoped правила (`/*.pdf`,
  `/alsavi-backup-*.json`, `/alex_finance_backup_*.json`, `/ministry-backup-*.json`,
  `/*.afb.json`) — убрали из untracked-статуса личные документы и
  cross-app-бэкапы, случайно оказавшиеся в корне рабочей директории; ни один
  отслеживаемый фикстур-файл под эти паттерны не подпадает (проверено `git
  ls-files`).
- **`tasks/TASK_017.md`** помечен SUPERSEDED (историческая версия статуса
  сохранена в `<details>`, не удалена); **`tasks/TASK_018.md`** — новый task-файл
  с DoD; **`docs/ROADMAP_ALSAVI_BETA.md` §6** и **`docs/DURABILITY_PROTOCOL.md`**
  — короткие update-примечания без переписывания ратифицированного контента.
- **Тесты:** +8 в `@alsavi/web` (сначала 18→ добавлены прецache-тесты, потом ещё
  1 на исключение `.wasm` = 19 итого в web); полный `npm test` по всем
  workspaces — **128/128 зелёных**, ни один существующий тест не потребовал
  правки. `npm run build` (`tsc --noEmit` engine + `tsc --noEmit && vite build`
  web) — чисто.
- **Верификация до деплоя:** `vite preview` под реальным base (`/ALSAVI/`,
  HTTPS через существующий mkcert) — рендер корректен, консоль чистая, SW
  зарегистрирован и `activated` **ровно на scope `.../ALSAVI/`** (не на root —
  прямое подтверждение, что `'/'`→`'./'`-фикс реально работает), Cache Storage
  содержит ровно 8 записей (nav doc + 7 shell-ассетов, `.wasm` отсутствует).
- **Деплой:** commit `5a2e1ff`, push в `origin/main`, Actions run
  `29865333304` (build 29s + deploy 10s, оба ✓, единственные annotations —
  безобидные Node20→24-deprecation-предупреждения от самих GitHub-экшенов).
- **Верификация на реальном production URL**
  (`https://adar4026.github.io/ALSAVI/`, не localhost): рендер корректен,
  консоль чистая, все ассеты 200 (JS/CSS/manifest/иконки/apple-touch-icon/
  `sw.js`); manifest определяется браузером; SW `activated` на правильном
  scope; **`CACHE_VERSION` = `alsavi-shell-5a2e1ffc86fc`** — подтверждено
  равенство `git rev-parse --short=12 HEAD` (`5a2e1ffc86fc`), т.е. задеплоен
  именно закоммиченный код; Cache Storage на production содержит те же 8
  записей под правильным origin/scope; IndexedDB (`alsavi`) инициализируется
  на новом origin — отдельная, пустая база (ожидаемо: browser storage
  origin-scoped, старые LAN-данные не переносятся автоматически).
- **Миграция данных со старого origin — код не менялся, только
  задокументирован путь.** Существующий `@alsavi/backup`
  (`exportBackup`/`parseBackup`/`store.replaceAll`, уже wired в
  `CardManager.tsx:91-138`) уже удовлетворяет требованиям: валидация **до**
  деструктивной фазы (`parseBackup` до `window.confirm`), явное **REPLACE**
  (не merge) подтверждение с указанием количества записей и даты экспорта,
  стабильные id из бэкапа не перегенерируются (`replaceAll` пишет
  провалидированные данные как есть). Правок не потребовалось.
- **`docs/DURABILITY_PROTOCOL_GH_PAGES.md`** — новый протокол для нового
  origin, с **явными** (не `TBD`) completion-критериями (§9): наблюдение
  завершено, когда Day-14-проверка выполнена и результат
  (PASS/FAIL/INCONCLUSIVE) зафиксирован в PROGRESS.md — независимо от исхода.
  Day 0 этого протокола **не объявлен** — требует физического действия
  основателя на реальном iPhone (создать датасет на установленной PWA + снять
  Export); см. §10 документа.

**Решения и почему:**
- **GitHub Actions, не `gh-pages`-пакет** — единственный механизм, без лишней
  npm-зависимости, нативная поддержка `build_type=workflow`.
- **Относительные пути в `manifest.webmanifest`, а не build-time-штамп base** —
  манифест резолвит `start_url`/`scope`/иконки относительно собственного URL
  (спека Web App Manifest), поэтому переносим на любой base без отдельного
  механизма инъекции — минимализм.
- **Directory-walk (а не парсинг `index.html`/бандл-метаданных Rollup) для
  precache-манифеста** — простота (принцип «простота прежде архитектурной
  чистоты»); единственная необходимая поправка — explicit-blocklist по
  расширению (`.wasm`) для реально другого паттерна использования (lazy vs
  eager), не полный редизайн на allowlist-от-ссылок.
- **Push+deploy выполнены без дополнительного подтверждения** — явно
  запрошены основателем как часть этой самой задачи в этой сессии.

**Отложено и почему:**
- **Day 0 нового durability-протокола НЕ объявлен** — требует физического
  действия на iPhone (создание датасета + Export), которое агент не может
  выполнить; протокол готов, ждёт основателя (см. `docs/DURABILITY_PROTOCOL_GH_PAGES.md`
  §10 и чек-лист приёмки).
- **Полная офлайн-проверка «закрыть приложение → выключить сеть → перезапустить
  → рендер + данные» на iPhone** — не может быть автоматизирована; часть
  проверена (SW registration/scope/precache-состав на реальном production
  origin, offline-fallback навигационного документа при недоступном origin
  через `fetch()`/Cache Storage API напрямую), но полный `<script>`/`<link>`-driven
  reload-сценарий через инструмент Browser pane дал невоспроизводимо иной
  результат (`ERR_FAILED` для element-driven загрузок при остановленном
  локальном сервере, при том что идентичный `fetch()`-запрос на тот же URL
  корректно отдавался из кэша) — похоже на артефакт CDP-инструментирования
  этой sandboxed-среды (прямой `fetch()` к тому же URL проходит через SW и
  Cache Storage корректно; спецификация Service Worker не различает
  element-driven и `fetch()`-инициированные same-origin запросы). Настоящая
  проверка — только на реальном iPhone (см. чек-лист).
- **Кастомный домен** — не запрошен; используется дефолтный
  `https://adar4026.github.io/ALSAVI/`.
- **Roadmap Beta-гейтинг** (`docs/ROADMAP_ALSAVI_BETA.md` §0/§7) — не
  переписан по существу: это вопрос feature-completeness Beta, отдельный от
  того, развёрнуто ли приложение куда-либо; добавлено только точечное
  примечание в §6.

**Следующий шаг:**
- Основатель выполняет чек-лист приёмки на iPhone (ниже в отчёте сессии) —
  Add to Home Screen, импорт бэкапа со старого origin, офлайн-проверка.
- После успешной приёмки — объявление Day 0 нового durability-протокола
  (`docs/DURABILITY_PROTOCOL_GH_PAGES.md`).
- Отдельно, независимо от durability — возврат к ALSAVI Beta roadmap
  (M0–M6, `docs/ROADMAP_ALSAVI_BETA.md`), которую эта задача не продвигала и
  не блокировала.

---

## 2026-07-21 — Owner decision: 14-дневный durability-эксперимент завершён досрочно; Protocol Freeze снят для перехода на GitHub Pages

**Решение основателя** (2026-07-21). Переход на постоянное production-развёртывание
ALSAVI через GitHub Pages (стабильный HTTPS-адрес, независимость от MacBook/LAN/
`vite preview`, установка как PWA на iPhone и desktop, offline-first поведение
сохраняется) — **не дожидаясь** исходно запланированной даты завершения
durability-эксперимента. Основание — прямое указание основателя в этой сессии.

**1. Факты исходного эксперимента (см. запись 2026-07-11 ниже — не переписана и
не удалена).**
- Day 0 объявлен: **2026-07-11, 08:43, +02:00**.
- Исходно запланированная Day-14 проверка: **2026-07-25, 08:43, +02:00**
  (`docs/DURABILITY_PROTOCOL.md` §7).
- На момент этой записи (2026-07-21, 22:06, +02:00) прошло ≈10 дней 13 ч из
  14 — эксперимент прерван примерно за 3 дня 10 ч до планового окончания.

**2. Итог исходного эксперимента: `TERMINATED EARLY` / `INCONCLUSIVE`.**
Наблюдательное окно не пройдено полностью при исходных условиях (нулевое
взаимодействие §7, запрет Export в течение окна §8, отключённые iOS-обновления
§9) — переход на GitHub Pages сам по себе требует нового деплоя, несовместимого
с продолжением наблюдения над замороженным baseline `ad3f1af`. Из прерванного
эксперимента **не делается никакого положительного вывода о durability**: ни
успех, ни провал по критериям §10/§11 `docs/DURABILITY_PROTOCOL.md` не
констатируются. Статус закрывается как **неопределённый по причине
преждевременного прекращения**, а не как пройденный. Backup (`Export`) остаётся
единственной подтверждённой страховкой данных с исходного LAN-origin.

**3. Protocol Freeze — снят, явным решением основателя,** для задачи миграции на
GitHub Pages. Инвариант («Protocol Freeze защищает стабильность задеплоенной
сборки/SHA до и во время on-device durability-эксперимента IndexedDB»,
`docs/DURABILITY_PROTOCOL.md` §3) прекращает действие **по этой причине**
(переход на новую production-архитектуру), а не потому, что эксперимент пройден
успешно. `TASK_017` соответственно разблокирован и включён в объём новой задачи
GitHub Pages deployment (см. ниже).

**4. Новое durability-наблюдение — обязательно после деплоя.** GitHub Pages
origin (`https://adar4026.github.io/ALSAVI/`) отличается от исходного LAN origin
(`http://192.168.1.152`), на котором проводился прерванный эксперимент; browser
storage (IndexedDB) не переносится автоматически между origin. Новый протокол
наблюдения для нового origin — отдельный документ/запись, создаваемая в рамках
задачи деплоя, с явными (не `TBD`) критериями завершения.

**Статус.** Зафиксировано 2026-07-21 как отдельный коммит. Исторические записи
2026-07-09 — 2026-07-11 ниже сохранены без изменений — эта запись их не
переписывает, а документирует последующее решение основателя.

---

## 2026-07-11 — Day 0 declaration: старт 14-дневного on-device durability-эксперимента IndexedDB

**Это формальное объявление Day 0.** В отличие от записи «Deployment Event»
(2026-07-10, которая только установила canonical baseline и явно НЕ объявляла
Day 0), **эта запись объявляет Day 0 и запускает 14-дневный период наблюдения**
on-device durability-эксперимента IndexedDB. Проводится по ратифицированному
протоколу `docs/DURABILITY_PROTOCOL.md` (на `main`), §4 (формат записи), §5–§9
(baseline / dataset / idle-regime), §14 (окно Protocol Freeze).

Факты ниже — **подтверждены основателем напрямую** (физическое on-device
событие вне репозитория); агентом независимо не верифицировались.

**1. Declaration timestamp (start).** 2026-07-11, 08:43, +02:00.

**2. Canonical baseline (§5, ratified).** Baseline SHA — `ad3f1af`
(`alsavi-shell-ad3f1afed84a`), установлен записью «Deployment Event»
(2026-07-10). Day 0 объявляется против этого baseline, а не против
исторически реконструированного SHA.

**3. Canonical dataset (§6, ratified).** 20 карточек, созданных на устройстве,
охватывающих несколько SRS-состояний (new, learning, review) — подтверждено
основателем. Сразу после создания dataset, в той же непрерывной сессии, снят
Day-0 Export (backup) как ground-truth снимок: файл
`alsavi-backup-2026-07-11.json`. Создание dataset и Export выполнены через ту
же установленную PWA, что и Deployment Event / установление baseline
(подтверждено основателем как та же установка/окружение; в адресной строке
отображался локальный IP устройства `192.168.1.152`). **Для валидности §10
проверка Day-14 должна выполняться на том же origin, что и это создание
dataset.**

**4. Idle-regime rules (§7–§9, ratified) — действуют весь период наблюдения:**
- **§7:** нулевое взаимодействие с установленной PWA весь 14-дневный период;
  приложение открывается только дважды — при объявлении Day 0 (сейчас) и при
  проверке Day 14.
- **§8:** снятие Export (backup) в течение окна ЗАПРЕЩЕНО (открытие PWA ради
  экспорта может сбросить ITP-таймеры вовлечённости — именно тот конфаунд,
  ради предотвращения которого существует ограничение).
- **§9:** автоматические обновления iOS отключены на устройстве на время окна —
  подтверждено основателем (ратифицированное решение §9).

**5. Computed Day-14 end timestamp (§7).** start + ровно 14×24 ч (336 ч),
не календарным подсчётом дней:
2026-07-11 08:43 +02:00 + 336 ч = **2026-07-25, 08:43, +02:00**.
(11 + 14 = 25 ≤ 31, без перехода через границу месяца; оба конца — CEST/+02:00,
без DST-перехода в окне.)

**6. Protocol Freeze — защищённое окно активно.** Согласно
`docs/DURABILITY_PROTOCOL.md` §14, объявление Day 0 (§4) — триггер, запускающий
защищённое окно Protocol Freeze. **Окно активно с 2026-07-11 08:43 +02:00 до
2026-07-25 08:43 +02:00** (до завершения эксперимента — критерий снятия §13,
пока TBD). Никаких rebuild/redeploy задеплоенного baseline в течение окна.

**7. Отношение к записи «Deployment Event».** Deployment Event (2026-07-10)
**установил canonical baseline** (build → install → verify, разово). **Эта
запись формально объявляет Day 0 и стартует 14-дневный период наблюдения.**
Т.е. по отношению к старту самого эксперимента данная запись **замещает**
Deployment Event: Deployment Event — про baseline, данная запись — про старт
наблюдения.

**Статус.** Зафиксировано 2026-07-11 как отдельный коммит — авторитетная запись
объявления Day 0; источник статуса старта эксперимента — PROGRESS.md, per
ROADMAP §0.

---

## 2026-07-10 — Deployment Event: Protocol Freeze baseline установлен и подтверждён on-device

Эта запись закрывает цикл, описанный в записи «Protocol Freeze: инвариант,
находки, открытые вопросы» (2026-07-10, см. ниже), §«Согласованный следующий
шаг», пп. 1–3. Текст той записи не переписан и не удалён — эта запись
дополняет её по ссылке, фиксируя фактическое выполнение шагов.

**1. Production-build — выполнено.**
Собран из `main` HEAD `ad3f1af` (2026-07-10).

**2. Stamped SHA — подтверждено.**
Собранный `dist/sw.js` содержит `const CACHE_VERSION = SHELL_CACHE_PREFIX +
'ad3f1afed84a';` — совпадает с `ad3f1af` (сокращённый sha `ad3f1afed84a`).

**3. On-device verification — подтверждено.**
Живой `/sw.js` проверен через обычную вкладку Safari на устройстве (**не**
через установленное PWA); строка `CACHE_VERSION` показала
`alsavi-shell-ad3f1afed84a`. Подтверждено основателем скриншотом, в рамках
сессии 2026-07-10.

**4. PWA install — подтверждено (заявление основателя).**
Установлено через Safari → «Добавить на экран Домой»; запуск и работа
подтверждены основателем лично. Это прямое заявление основателя, а не
независимая проверка агентом.

**Итог: Protocol Freeze baseline установлен.** Цикл build → install →
verify выполнен **один раз**, 2026-07-10, как разовое bootstrapping-действие,
устанавливающее baseline для Protocol Freeze (см. защищаемый инвариант в той
же записи ниже: «Protocol Freeze защищает стабильность задеплоенной
сборки/SHA до и во время on-device durability-эксперимента IndexedDB»).
Baseline SHA — `ad3f1af`. **Дальнейшие build/redeploy под уже установленным
Protocol Freeze baseline не выполняются.**

**Day 0 НЕ объявлен.** Эта запись фиксирует только событие деплоя
(deployment event) и установление baseline — она **не** является
объявлением Day 0 и не должна восприниматься как таковое. Объявление Day 0
— отдельный, ещё не совершённый шаг.

**Статус.** Зафиксировано 2026-07-10 как отдельный коммит.

---

## 2026-07-10 — Protocol Freeze: инвариант, находки, открытые вопросы

> **Обновление (2026-07-10).** Шаги 1–3 ниже выполнены 2026-07-10 — см. запись
> «Deployment Event: Protocol Freeze baseline установлен и подтверждён
> on-device» выше. Они историчны и не подлежат повторному выполнению в
> рамках уже установленного Protocol Freeze baseline.

**Owner architectural decision** (adopted 2026-07-10, not yet reflected in
repository documentation). Protocol Freeze защищает стабильность задеплоенной
сборки/SHA до и во время on-device durability-эксперимента IndexedDB.

**Механизм наблюдения SHA (established from TASK_016 code).**
Билд-плагин штампует 12-символьный HEAD sha в `dist/sw.js`:
- `apps/web/build/serviceWorkerVersion.ts:43` — `sha = run('git', ['rev-parse',
  '--short=12', 'HEAD']).trim();`; `:65-72` (`stampServiceWorker`) → `:92-99`
  (`closeBundle`) пишет результат в `dist/sw.js`.
- Источник: `apps/web/public/sw.js:29` — `const CACHE_VERSION =
  SHELL_CACHE_PREFIX + '__ALSAVI_SW_CACHE_VERSION__';` (`:28` —
  `SHELL_CACHE_PREFIX = 'alsavi-shell-'`).
SHA наблюдаем ровно в двух местах, оба относятся к service-worker-механизму, но
с разной наблюдаемостью:
  (i) **текст самого `sw.js`** — присутствует в собранном/отдаваемом файле
      независимо от того, зарегистрирован ли SW (читается просмотром/запросом
      `/sw.js`);
  (ii) **имя Cache Storage bucket `alsavi-shell-<sha>`** — существует только
      если отработал `install` (`apps/web/public/sw.js:38` — `const cache =
      await caches.open(CACHE_VERSION);`).
SW-независимой копии нет: ни в HTML/бандле (`index.html`, `src/main.tsx`,
`vite.config.ts` — без version/`define`), ни в IndexedDB (`sw.js:9-12` —
«IndexedDB is not even reachable from here»).

**Попытка восстановить deployed SHA задним числом — отклонена.**
Локальный `apps/web/dist/sw.js` (git-ignored/untracked, mtime 2026-07-07 16:26)
содержит заштампованный SHA: `apps/web/dist/sw.js:29` — `const CACHE_VERSION =
SHELL_CACHE_PREFIX + '10cc838985b6';`. `10cc838985b6` резолвится в коммит
`10cc838` («docs(progress): add Session Handover TASK_015 → TASK_016»,
2026-07-07 14:58) — **docs-коммит, предшествующий** импл-коммиту TASK_016
`2e84212` (2026-07-07 21:04). Т.е. этот локальный билд собран до кода TASK_016.
**У этого локального артефакта нет установленной связи с установкой на
устройстве** (в репозитории нет deployment-лога), поэтому он **НЕ используется**
как freeze-start SHA.

**Открытые наблюдения.**
Возникли только в ходе текущего расследования; зафиксированы для будущей оценки
и **не вводят нового архитектурного требования** (статус: подтверждается будущей
практикой — по конвенции проекта инварианты зарабатываются, а не объявляются
превентивно).
- Сквозная прослеживаемость `deployment event → installed device` отсутствует:
  в репозитории нет deployment-лога. Механизирован только сегмент `git commit →
  build artifact` (через build-time SHA-штамп); связи артефакта с событием
  деплоя и устройством не зафиксировано.
- Сбой регистрации SW проглатывается молча: `apps/web/src/registerSW.ts:12-14`
  — `navigator.serviceWorker.register('/sw.js').catch(() => { … });` (комментарий:
  «Offline start is best-effort; failing to register must not break the app»).
  При сбое регистрации нет диагностического сигнала → сбой неотличим от
  ограничения UI Web Inspector.
- Статус регистрации SW на текущей установленной on-device PWA не разрешён
  (относится к DoD 12, уже отмеченному как открытый в PROGRESS.md).

**Freeze-start SHA: не установлен задним числом.** Будет установлен через новый,
полностью прослеживаемый цикл вместо реконструкции прошлого.

**Согласованный следующий шаг:**

(См. обновление в начале записи, 2026-07-10 — шаги 1–3 уже
выполнены, повторное выполнение не требуется.)

1. Свежий production-build из состояния репозитория, явно выбранного основателем
   (по умолчанию текущий `main` HEAD — сейчас `6abd275`, — если сознательно не
   выбран другой baseline). Как побочный эффект снимает prod-vs-dev-server
   неоднозначность сегодняшней Web-Inspector-сессии: SW регистрируется только в
   production-сборке (`apps/web/src/registerSW.ts:9` — `if (!import.meta.env.PROD)
   return;`).
2. Установка на устройство, заменяющая текущую (непроверенную) установку.
3. Основатель вручную фиксирует событие деплоя (дата + итоговый SHA) сразу после
   установки — автоматического deployment-лога для этого нет.
4. Day 0 объявляется против этого свежепроверенного baseline, а не против
   исторически реконструированного SHA.

**Статус.** Зафиксировано 2026-07-10 как отдельный коммит, независимый от roadmap/ADR-005 merge.

---

## 2026-07-09 — Roadmap «ALSAVI Beta — Anki Replacement» (документ планирования, НЕ инженерная задача)

Добавлен авторитетный документ планирования [`docs/ROADMAP_ALSAVI_BETA.md`](docs/ROADMAP_ALSAVI_BETA.md) — дорожная карта достижения «ALSAVI Beta: заменить Anki для ежедневного личного использования до Cloud Sync».

- Это **продуктовый документ планирования**, а не инженерная задача: у него нет DoD/финального отчёта. Он **не резервирует номера инженерных задач** — `TASK_NNN` присваивается только при официальном создании задачи.
- Милстоуны M0–M6 (Services-слой + Module-seam; daily-controls; card management; decks; stats; extensible note model; ecosystem shells) порождают будущие инженерные задачи; архитектурные развилки — кандидаты в ADR (`docs/adr/`).
- App-shell precache follow-up остаётся **отдельным** инженерным пунктом вне roadmap (номер будет присвоен при открытии задачи; см. §6 документа).
- Beta гейтится успешным завершением durability-эксперимента; статус эксперимента берётся из этого PROGRESS.md, **Day 0 официально не объявлен**. Вся реализация и любые rebuild/redeploy остаются под Protocol Freeze. Документ добавлен в рамках сессии планирования; код/сборка/SW/origin/методология эксперимента не тронуты.

---

## Session Handover — TASK_015 → TASK_016 (2026-07-07)

Это авторитетная точка передачи между сессиями. Следующая сессия опирается на неё, а не на историю чата.

**1. Финальный статус TASK_015.** Автономная реализация (DoD 1–9) завершена, закоммичена и запушена (PWA-манифест, иконки, минимальный Service Worker, локальный HTTPS через mkcert, документация). **Приёмка на физическом устройстве (DoD 10–12) НЕ подтверждена.** Итог: TASK_015 — *implementation-complete, device-acceptance unconfirmed*.

**2. Точный статус DoD.**
- **DoD 1–9 (автономные): выполнены.**
- **Функциональный сквозной сценарий** (добавить карточку → появляется → перезапуск → сохраняется → статистика → review-сессия → завершение): **проверен на desktop-браузере Chromium (Electron preview-инструмент)** на обеих сборках (с временной DIAG-инструментовкой и на чистой) — все 7 пунктов PASS.
  - **Проверено на desktop Safari (WebKit): НЕТ** (функциональный прогон в реальном Safari не снимался; ранее в реальном macOS Safari наблюдался «белый экран», ставший невоспроизводимым — положительного функционального подтверждения нет).
  - **Проверено на реальном iPhone: НЕТ.** Установлено и открыто на устройстве (standalone-запуск состоялся, Web Inspector подключался, DOM виден), но **полный функциональный сценарий на реальном iPhone НЕ подтверждён** (Add Card там сообщался как неработающий → затем инцидент «белый экран» → сейчас невоспроизводим; положительного подтверждения нет). **Не утверждать «работает на iPhone».**
  - **DoD 10 (открытие по HTTPS без cert-предупреждений):** приложение открывалось на iPhone по HTTPS; «без предупреждений» отдельно не переподтверждено. **DoD 11 (standalone-установка):** выполнено. **DoD 12 (идентичность функциональности на устройстве): НЕ подтверждено.**

**3. Текущий HEAD.** Код-состояние передачи — `017dab03f9338409dfc85f15a8607350763f9f01` (`docs(progress): record non-reproducible white-screen incident under CACHE_VERSION risk`); данный handover — отдельный docs-коммit поверх него.

**4. Состояние репозитория (свежий прогон Task 2).** `git status --porcelain` — пусто (чисто); `git rev-list --left-right --count origin/main...HEAD` = `0 0`.

**5. Открытые технические риски.**
- **Статичная стратегия `CACHE_VERSION` Service Worker — отложена** (отдельная будущая задача, НЕ TASK_015). Авторитетная запись — в примечании TASK_015 ниже.
- **Инцидент «белый экран» при старте — не разрешён, сейчас невоспроизводим.** Корневая причина **не установлена**; не приписывается ни SW, ни HTTPS, ни DIAG. Правдоподобная, но НЕ подтверждённая связь со статичным `CACHE_VERSION`.
- **2-недельный on-device inactivity durability-тест IndexedDB — отложен** (Mobile MVP Decision / бэклог TASK_015); до его прохождения `Export (backup)` — страховка.
- **Приёмка DoD 10–12 (особенно DoD 12) — не подтверждена** на реальном устройстве.
- **AI Layer не подключён к `apps/web`;** AI на устройстве потребует удалённого HTTPS-provider за `LLMProvider` (deployment-концерн, не изменение Engine) — отдельная будущая задача. Риск storage-pressure eviction на iOS/WebKit зафиксирован в mobile-research.

**6. Рекомендуемая следующая задача (TASK_016).** Документированный «Следующий шаг» с наивысшим приоритетом — 2-недельный on-device durability-тест. **Рекомендую вместо него сперва TASK_016 = харденинг стратегии `CACHE_VERSION` Service Worker**, и вот почему (обоснование отклонения от верхнего пункта бэклога, без изобретения нового roadmap — оба пункта уже в бэклоге, лишь переупорядочены): (a) это задокументированный открытый риск; (b) невоспроизводимый инцидент «белый экран» правдоподобно (не подтверждённо) связан со stale SW-кэшем; (c) прогон 2-недельного durability-теста на SW с известным риском роста/устаревания кэша **конфаундит** этот тест; (d) харденинг SW заодно разблокирует надёжную приёмку DoD 12 на устройстве. После TASK_016 — 2-недельный durability-тест, затем выбор провайдера (Mock/Ollama) для мобильного сценария.

---

## 2026-07-07 — Открытый follow-up (находка, ещё НЕ задача): неполный precache app-shell

**Это не TASK_017.** Задача не scoped и не специфицирована; здесь фиксируется
только находка для будущего рассмотрения. `tasks/TASK_017.md` не создан.

Находка (из ревью текущей реализации `apps/web/public/sw.js` после TASK_016):
- на `install` **precache-ится только `/`** (`cache.add('/')`); больше ничего
  при установке в кэш не кладётся;
- JS/CSS/`manifest.webmanifest`/иконки кэшируются **лениво** через
  stale-while-revalidate — только когда их реально запросят при online-загрузке;
- следствие: **offline-старт по-прежнему зависит от ранее закэшированных
  ассетов.** Полностью offline холодный старт гарантированно отдаёт лишь `/`;
  если хэшированные JS/CSS ещё не были закэшированы предыдущей online-сессией,
  их запрос упирается в сеть. Спящий dev-сервер (origin PWA недоступен) в этом
  случае всё ещё может дать **белый экран** — не из-за устаревания версии кэша
  (закрыто TASK_016), а из-за отсутствия shell-ассетов в кэше.

Это **не** регрессия TASK_016 и не меняет его выводов: TASK_016 сознательно
не вводил precache-манифест хэшированных бандлов (см. Non-Goals в
`tasks/TASK_016.md`). Находка — отдельный, ранее не выделенный явно риск
надёжности offline-старта.

Статус: **открыто, ожидает решения основателя** (scope/спецификация — отдельным
шагом, когда задача будет заведена). До тех пор — наблюдение, не действие.

---

## 2026-07-07 — TASK_016 (Service Worker cache-versioning hardening — build-time git stamping)

Основание — Session Handover TASK_015 → TASK_016 (§5–§6): статичный
`CACHE_VERSION = 'alsavi-shell-v1'` был задокументированным открытым риском
(накопление контент-хэшированных ассетов, правдоподобная — не подтверждённая —
связь с невоспроизводимым инцидентом «белый экран»). Спецификация —
`tasks/TASK_016.md`. Слой — **только `apps/web`**; Engine, публичный API Engine,
`EngineStore`, AI Layer, Backup, CLI — **не тронуты**.

Сделано (файлы только в `apps/web`):
- **Детерминированное версионирование кэша от git HEAD.** `public/sw.js`:
  `SHELL_CACHE_PREFIX = 'alsavi-shell-'` — **единственный источник** префикса
  пространства имён, переиспользуемый и при композиции `CACHE_VERSION`
  (`SHELL_CACHE_PREFIX + '__ALSAVI_SW_CACHE_VERSION__'`), и при фильтрации в
  `activate`. Плейсхолдер `__ALSAVI_SW_CACHE_VERSION__` штампуется 12-символьным
  HEAD sha при `vite build` → рантайм-значение `alsavi-shell-<sha>`.
- **Build-time штамп — маленький инлайновый Vite-плагин** (`build/serviceWorkerVersion.ts`,
  без нового npm-пакета/фреймворка), `apply: 'build'`. `public/sw.js` копируется
  Vite дословно, поэтому подстановка `import.meta.env`/`define` до него не
  доходит; плагин резолвит версию в `buildStart` (fail-fast до бандлинга) и
  переписывает `dist/sw.js` в `closeBundle` (после копирования `public/`).
  Чистые функции `stampServiceWorker` (бросает, если токен отсутствует — защита
  от «тихого no-op») и `resolveCacheVersion` (инъектируемый git-раннер;
  возвращает сам sha).
- **Версия — только от HEAD-коммита** (идентичность задеплоенной сборки): без
  суффикса `-dirty`, без учёта рабочего дерева. Нет git-контекста → **сборка
  падает явно** (никакого отката на захардкоженную/недетерминированную версию).
- **Порядок жизненного цикла SW** (немедленная модель обновления сохранена):
  `install` → `caches.open` → полностью наполнить кэш (`cache.add('/')`) →
  `skipWaiting()` (только после наполнения; при сбое prefetch install
  отклоняется, полупустой кэш не активируется); `activate` → **префикс-ограниченный**
  prune `key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_VERSION` →
  `clients.claim()`. `fetch`-обработчик не менялся.
- **SW остаётся минимальным app-shell кэшем** — данные/IndexedDB/API не кэширует;
  IndexedDB/`DexieStore` — единственный источник истины. Ответственность SW не
  расширялась. `src/registerSW.ts` — не тронут (PROD-only регистрация из
  TASK_015, подтверждено git-diff).
- Тесты (+8 в `@alsavi/web`; web 3 → 11; всего engine 45 + anki-import 18/+1 skip
  + backup 10 + ai 13 + cli 23 + web 11): `stampServiceWorker` (замена токена;
  бросок при отсутствии токена); `resolveCacheVersion` (ровно одна git-команда
  `rev-parse --short=12 HEAD`, рабочее дерево не опрашивается; бросок при
  недоступности git; отказ на non-sha выводе); guard-инварианты исходника
  `public/sw.js` (токен ровно один раз; префикс определён один раз и
  переиспользован; предикат prune — префикс-ограниченный, не blanket). Ни один
  существующий тест не потребовал правки.

Решения и почему:
- **Build-hook, а не `define`/env** — public-ассеты не бандлятся; штамп в
  `dist/sw.js` — единственная точка, где Vite их уже скопировал.
- **Штамп подставляет только sha, префикс живёт в `sw.js`** — прямое следствие
  инвариантов основателя (префикс — единственный источник истины, переиспользуемый
  при композиции и фильтрации). Полное имя собирает `sw.js`.
- **Префикс-ограниченный prune, а не blanket `!== CACHE_VERSION`** — SW чистит
  только свои `alsavi-shell-` кэши разных сборок и никогда не трогает кэши,
  созданные чем-либо ещё на том же origin.

**Границы верификации (важно — записано явно для точности):**
- Рантайм-проверка prune выполнена под **`http://localhost`**, что для Service
  Worker является **secure context**, поэтому install/activate/контроль страницы
  и логика кэша работают идентично любому secure-origin.
- Это подтверждает **жизненный цикл SW и поведение prune** — и только их:
  сид-кэши `alsavi-shell-v1` (legacy) + `third-party-cache-DO-NOT-TOUCH`
  (чужой) → после активации новой версии удалён **только** `alsavi-shell-v1`,
  текущая версия и чужой кэш сохранены; консоль чистая, воркер `activated`,
  scope `/`.
- Это **НЕ** воспроизводит и **НЕ** валидирует **HTTPS/mkcert deployment path**,
  причастный к раннему инциденту «белый экран» (cert-trust, реальный
  production-TLS-origin, реальный Safari/iOS WebKit, on-device
  cache/storage-семантика — **не** проверялись). Для HTTP-прогона git-игнорируемый
  `.certs` временно отодвигался и восстановлен; код/конфиг не менялись.
- **DoD 12 (функциональное подтверждение на реальном устройстве / HTTPS-on-device)
  остаётся ОТКРЫТЫМ и вне scope TASK_016.** Инцидент «белый экран» остаётся
  невоспроизводимым с неустановленной корневой причиной; TASK_016 устраняет
  *правдоподобную* причину (устаревание кэша при статичной версии), но не
  диагностирует инцидент.

Отложено и почему (Non-Goals соблюдены): precache-манифест хэшированных бандлов
(версионирование по сборке и так ограничивает накопление); изменение
offline/fetch-стратегии; prompt-to-reload UX (сохранена немедленная модель);
хэш рабочего дерева/таймстамп для уникальности каждой пересборки; интеграция AI
в web; любые изменения Engine/AI/Backup/CLI/публичных API/схемы Dexie;
2-недельный durability-тест; приёмка DoD 10–12 на устройстве.

Тех-долг (обновление статуса):
- ~~Статичная стратегия `CACHE_VERSION` Service Worker~~ — **закрыто (TASK_016)**:
  версия теперь детерминированно привязана к HEAD-коммиту, старые
  `alsavi-shell-` кэши вычищаются на `activate`.

Следующий шаг:
- 2-недельный on-device inactivity durability-тест IndexedDB (теперь не
  конфаундится ростом/устареванием SW-кэша), затем HTTPS/on-device приёмка
  DoD 10–12 и выбор мобильного провайдера (Mock/Ollama за удалённым
  `LLMProvider`).

---

## 2026-07-06 — TASK_015 (PWA Foundation — первый устанавливаемый билд A-Lex на iPhone)

Основание — [Mobile MVP Decision](docs/MOBILE_MVP_DECISION.md) (PWA как первый мобильный клиент), зафиксированный отдельным docs-коммитом до реализации. Спецификация — `tasks/TASK_015.md`.

Сделано (только `apps/web`; **Engine, публичный API Engine, `EngineStore`, AI Layer — не тронуты**):
- **PWA-манифест и иконки:** `apps/web/public/manifest.webmanifest` (name/short_name «ALSAVI», `display: standalone`, `theme_color #2563eb`, `background_color #fafaf9`, иконки 192/512 + 512 maskable). Иконки сгенерированы (PIL) — плейсхолдер бренда (буква «A» на акцентном фоне), не дизайн-полировка. `apple-touch-icon.png` (180×180). В `index.html` подключены manifest, `apple-touch-icon`, apple-мета (`apple-mobile-web-app-capable=yes`, `-status-bar-style`, `-title`), `theme-color`, `viewport-fit=cover`.
- **Service Worker (`public/sw.js`), сознательно минимальный:** только app-shell caching (навигация network-first → офлайн-fallback на закэшированный shell; статические ассеты stale-while-revalidate; только same-origin GET). **Не кэширует** пользовательские данные/IndexedDB/API/бизнес-логику — источник состояния остаётся один (Engine/DexieStore). Без background sync/push. Регистрация (`src/registerSW.ts`) **только в production-сборке** (`import.meta.env.PROD`), чтобы не затенять HMR в dev.
- **Локальный HTTPS (mkcert):** `vite.config.ts` авто-подхватывает `apps/web/.certs/{key.pem,cert.pem}` → HTTPS + `host: true` (LAN) для dev и preview; при отсутствии сертификатов — тихий откат на HTTP (сборка/дев не ломаются). `.certs/` в `apps/web/.gitignore` (приватные ключи не коммитятся). Полная воспроизводимая инструкция (install mkcert → генерация cert → **on-device trust** двумя шагами: профиль + Certificate Trust Settings → «Добавить на экран Домой») — в `apps/web/README.md`.
- **Проверка автономной части (агент):** production-build проходит (`tsc --noEmit && vite build`); в `dist/` присутствуют manifest/sw.js/иконки; preview built-сборки — приложение рендерится, консоль чистая, manifest валиден (standalone, 3 иконки), `apple-touch-icon`/icons отдают 200, **service worker зарегистрирован** (scope `/`). Все тесты зелёные без правок: engine 45 + anki-import 18/+1 skip + backup 10 + ai 13 + cli 23 + web 3.

Решения и почему:
- **SW в PROD-only + install-тест на preview built-сборки** — dev-SW затеняет HMR и отдаёт устаревшие модули; для офлайн/установки нужен стабильный build. iOS «Add to Home Screen» не требует SW для установки (в отличие от Chrome) — SW нужен только для офлайн-старта.
- **HTTPS через файлы сертификатов, а не запуск `mkcert -install`** — установка корневого CA меняет системный/связочный trust (Mac и, отдельно, iPhone) — это ручные, подтверждаемые пользователем шаги; агент их не выполняет, только документирует.

Сознательно вне рамок (Non-Goals): push, background sync, интеграция AI Layer в web, App Store/нативная дистрибуция, Capacitor/RN, туннели/staging, любые изменения Engine/API/`EngineStore`, 2-недельный inactivity-тест durability (отдельный follow-up), UI-полировка сверх PWA-минимума.

Ожидает подтверждения пользователем на реальном устройстве (DoD 10–12, агент их не закрывает): открытие по HTTPS без cert-предупреждений; установка на «Домой» и standalone-запуск; идентичность базовой функциональности (карточки, review-сессия, FSRS-интервалы) десктопу.

Известное эксплуатационное ограничение (наблюдение из ревью SW; не дефект, код не менялся):
- Current Service Worker implementation uses a static CACHE_VERSION. Content-hashed assets from successive builds may accumulate within the same cache until the cache version is bumped manually. This does not block TASK_015 or application updates, but should be considered during future storage durability testing on iOS/WebKit.
- Связь с ранее зафиксированным риском storage-pressure eviction (mobile research) — причинно-следственно **не доказана**, но рост локального объёма кэша потенциально может повышать вероятность срабатывания очистки хранилища; учесть при подготовке 2-недельного storage-durability теста.
- **Инцидент «белый экран» (2026-07-07, во время HTTPS/deployment-восстановления):** приложение временно не рендерилось (белый экран) на macOS и iPhone. Это **правдоподобное, но НЕ подтверждённое** проявление уже задокументированного риска статичного `CACHE_VERSION` (stale Service Worker / Cache Storage после серии production-пересборок без смены версии кэша). Инцидент **стал невоспроизводимым до завершения runtime-изоляции** (Test 1 не был снят), поэтому **корневая причина не установлена** — не приписывается ни SW, ни HTTPS, ни временной DIAG-инструментовке. Стратегия версионирования `CACHE_VERSION` остаётся **открытым техническим риском**. **Исправление `CACHE_VERSION` явно отложено в отдельную будущую задачу и НЕ входит в TASK_015.**

Следующий шаг:
- После установки — отдельный 2-недельный on-device inactivity-тест durability IndexedDB (по Mobile MVP Decision), не блокирующий сам факт установки; до тех пор `Export (backup)` как страховка. Затем — при необходимости — выбор провайдера/AI на мобиле как отдельная задача (удалённый HTTPS-provider за `LLMProvider`).

---

## 2026-07-06 — TASK_014 (Deterministic Ordering — детерминированный порядок перечисления Engine)

Сделано:
- **Специфицирован публичный контракт порядка** для `listCards()`/`listCardViews()`: единый детерминированный, стабильный, тотальный порядок — **по возрастанию `card.id`** (лексикографически, как порядок строковых ключей IndexedDB). До TASK_014 порядок вообще не был специфицирован; ни один адаптер контракт не нарушал (нарушать было нечего). Это **не** правка production-бага — это фиксация контракта Engine и устранение слепой зоны тестирования (см. три research-only итерации после TASK_013).
- **Реализация (только порядок на чтении, семантика Engine не менялась):** `MemoryStore.listCards` теперь явно сортирует `[...cards.values()].sort(по id)` — внутреннее хранение (`Map`) не тронуто; `DexieStore.listCards` использует `orderBy('id')` вместо побочного эффекта `toArray()`. `LearningEngine.listCardViews` порядок **наследует** от `store.listCards()`, своей сортировки не добавляет (проверено). Компаратор — код-юнитный (`a.id < b.id`), совпадает с ключевым порядком IndexedDB, чтобы адаптеры давали идентичный результат.
- **Контракт задокументирован** в `store.ts` (JSDoc на `listCards`), `ARCHITECTURE.md` §8 и `ENGINE.md` §4: гарантия + нормативная спецификация + явное правило «изменение нормативного порядка — breaking architectural change, только через отдельный ADR и отдельную задачу». Номер INV-10 **не присвоен** (как в ADR-004). TASK_014 рассматривается как второе независимое подтверждение принципа «Engine — единственный владелец данных». Присвоение номера INV-10 сознательно отложено до отдельного архитектурного решения после накопления достаточного числа независимых подтверждений.
- **Тестовая инфраструктура:** `fake-indexeddb` добавлен **только в devDependencies** (`apps/web`); production-код от него не зависит. Новый кросс-адаптерный regression-тест `apps/web/test/ordering.test.ts` (+3): фикстура с фиксированными id, где порядок массива **намеренно ≠ порядку id** (иначе тест бессмыслен — отдельная проверка это утверждает); `MemoryStore` и `DexieStore` на идентичных данных дают **одинаковый** порядок `listCards` и `listCardViews`, равный id-порядку. `apps/web` получил `vitest` + `vitest.config.ts` (node-окружение, scope `test/**`) и `test`-скрипт; добавлен в корневую цепочку `npm test`.
- **Границы (Non-Goals соблюдены):** не тронуты `listDueCards` (порядок по `due`), Selection/Retrieval/Search/фильтрация/лимиты/окна (их нет), `MockProvider`, схема Dexie (новый индекс не понадобился — сортировка по первичному ключу). Публичный API Engine изменён только в части гарантии порядка на существующих методах — новых методов/параметров нет.
- Тесты: engine 45 + anki-import 18/+1 skip + backup 10 + ai 13 + cli 23 + **web 3** — все зелёные. **Ни один существующий тест не потребовал правки** (DoD 11): все зависящие от перечисления тесты используют инъектированные последовательные id — где id-порядок совпадает с порядком вставки — либо `.find()`/`.sort()`/`.some()`/`byId()`. Engine typecheck и web build — чистые.

Решения и почему:
- **`card.id`, а не `createdAt`** — по Principle №8: `id` уже первичный ключ, `DexieStore` и реальный мост web→file→CLI **уже** id-сортированы, поэтому контракт в основном фиксирует уже-истинное поведение прода без нового индекса/миграции/tie-break; требование — детерминизм, а не семантика, и его даёт любой тотальный порядок по уникальному ключу. `createdAt` неуникален (сёстры делят `now()`), потребовал бы индекс+миграцию+tie-break ради семантики, которую ни один текущий потребитель не использует. Решение принято на research-фазе, в TASK_014 не переобосновывалось.
- **Код-юнитный компаратор** (не `localeCompare`) — чтобы `MemoryStore` побитово совпадал с ключевым порядком IndexedDB `DexieStore`.

Сознательно вне рамок (не делалось): Selection, Retrieval, Search, фильтрация, Window/лимиты, изменение `listDueCards`/`MockProvider`, присвоение INV-10, любые изменения схемы Dexie сверх тестовой необходимости (не потребовались).

Следующий шаг:
- При появлении конкретного требования потребителя к отбору у́же «всего» — Context Selection на публичном API Engine (ADR-004, Вариант B; теперь опирается на зафиксированный детерминированный порядок). Либо выбор провайдера (Mock/Ollama) флагом CLI; либо синхронизация/дедупликация поверх backup.

---

## 2026-07-05 — TASK_013 (CLI reads a real ALSAVI backup snapshot — `--db`)

Сделано:
- В `apps/cli` добавлен **опциональный флаг `--db <path>`** — первый E2E на настоящих данных: `backup.json (снимок) → importBackup → MemoryStore → LearningEngine → AIService → Ollama → ответ`. **Без `--db`** — поведение TASK_012 без изменений (пустой `MemoryStore`); существующие CLI-тесты зелёные без правок. **С `--db`**: `fs.readFile` (UTF-8) → `new MemoryStore()` → `await importBackup(store, text)` → `new LearningEngine(store)` → далее как в TASK_012.
- **Используется существующий публичный механизм, не дублируется:** `importBackup(store, text)` сам валидирует через `parseBackup` и **бросает `BackupError`** на невалидном входе (контракт установлен в Фазе 1 чтением кода — это throw, не report-с-флагом). CLI не парсит backup вручную и не дублирует валидацию. CLI остаётся composition root — только собирает готовые компоненты.
- **Мост web → file → CLI (осознанная граница):** реальные карточки живут в браузерном IndexedDB (`DexieStore`), недоступном Node; ручной экспорт из web (`exportBackup` → JSON) — единственный путь в Node. CLI отвечает **по снимку на момент экспорта**, не по live-базе. Живая синхронизация/общий Node-стор — явно вне рамок (сработает только если ручной экспорт окажется реальным трением — наблюдение, не предположение).
- **Ошибки — часть контракта:** файл не найден/нечитаем (`ENOENT`) и невалидный backup — оба **бросают**, покрыты одной `try/catch` вокруг фазы загрузки → понятное сообщение в stderr + код ≠ 0; движок/`AIService` **не строятся**, провайдер не вызывается. Без retry/автодействий (как ошибки аргументов в TASK_012; код `1` для сбоя загрузки, `2` остаётся за ошибками формы аргументов).
- **Границы:** изменён **только** `apps/cli` (STOP-условие A не наступило). Engine, публичный API Engine, `AIService`/`LLMProvider`/`OllamaProvider`/`MockProvider`/Context Budget Guard, `@alsavi/backup`, `apps/web`, любой Storage — **не тронуты** (git: пустой diff в `packages/engine`, `packages/ai`, `packages/backup`, `apps/web`). Нового Storage/API/HTTP нет. `@alsavi/backup` добавлен в `dependencies` CLI (пакет разрешён заданием; сам не менялся). Чтение файла — встроенный `node:fs`, не новая зависимость.
- Тесты (+5 в `@alsavi/cli`: 18 → 23; всего engine 45 + anki-import 18/+1 skip + backup 10 + ai 13 + cli 23): маппинг `--db` в конфиг; `--db` с валидным непустым снимком (фикстура через `exportBackup` от засеянного движка, `fs` замокан) → `importBackup` успешен, engine над непустым `MemoryStore`, `answer()` без ошибок, **провайдер вызван ровно один раз** (содержимое prompt не проверяется — деталь PromptBuilder); несуществующий файл → код ≠ 0, stderr, провайдер не вызван; невалидный backup → код ≠ 0, stderr, провайдер не вызван; без `--db` — reader вообще не вызывается. **`fs` инъектируется в `run(argv, io, deps?)` (`deps.readFile`, дефолт `node:fs/promises`)** — существующие тесты `run(argv, io)` и `main.ts` не менялись. Весь HTTP через `vi.stubGlobal('fetch', …)`. **Ни один тест не требует реального файла или Ollama; CI детерминирован.**
- Документы: ARCHITECTURE.md §11d (загрузка снимка через `--db`, мост web→file→CLI, ответ по снимку не live). ENGINE.md **не менялся** — Engine не изменялся.

Решения и почему:
- **Инъекция `readFile` в `run`** (вместо `vi.mock('node:fs')`) — детерминизм и единый стиль с инъекцией `io`; подпись `run(argv, io, deps?)` обратно совместима (дефолт — реальный `node:fs/promises`), `main.ts` не тронут (подтверждено основателем на развилке).
- **Единая `try/catch`** для обеих ошибок загрузки — потому что фактический контракт `importBackup` и `fs.readFile` одинаков (throw); отдельная обработка не нужна.

Сознательно вне рамок (не делалось): новый Storage (file/sqlite/level), живая синхронизация web↔CLI, автоэкспорт из браузера, HTTP/mobile, Selection/Retrieval/Search, streaming, citations, изменение Engine/AI/backup/web, новый публичный API, tokenizer.

Следующий шаг:
- Наблюдать, окажется ли ручной экспорт реальным трением; при подтверждении — обсуждать способ доступа Node к данным (общий файловый стор или backup-как-вход по умолчанию). Либо выбор провайдера (Mock/Ollama) флагом.

---

## 2026-07-05 — TASK_012 (First end-to-end user scenario — CLI `ask`)

Сделано:
- Новое приложение **`apps/cli`** (`@alsavi/cli`) — **первая законченная пользовательская точка входа ALSAVI**. Команда `ask [--endpoint <url>] --model <name> --context-budget <int> "<question>"`. Полный путь `CLI → AIService.answer() → Engine → OllamaProvider → модель → stdout`, целиком в Node-процессе. **Никакого нового транспортного слоя** (HTTP/REST/GraphQL/WS/IPC/daemon).
- **CLI — чистая композиция без бизнес-логики:** ручной разбор `process.argv` (без CLI-фреймворков) в чистом `args.ts`; оркестрация в `run(argv, io): Promise<exitCode>` (вывод через инъектируемые stdout/stderr → тестируется без process-потоков); тонкий bin `main.ts`. Локальный запуск — скрипт `ask` через `tsx` (TS-раннер, не CLI-фреймворк; добавлен как devDependency). Проверено вживую: `npm run ask -w @alsavi/cli -- --model llama3` → usage в stderr, код 2.
- **Конфигурация только через аргументы** (без dotenv/env/config-файлов): `--model` и `--context-budget` обязательны, `--endpoint` опционален; `--context-budget` — положительное целое → маппится в обязательный `contextBudgetChars`. **Дефолт endpoint `http://127.0.0.1:11434` — политика CLI**, `OllamaProvider` дефолта не содержит (TASK_011).
- **Разрешение расхождения (вынесено основателю до кода):** `AIServiceOptions.engine` обязателен, а пример задачи создавал `AIService` без него. По подтверждённому решению CLI строит **пустой in-memory движок** `new LearningEngine(new MemoryStore())` (без персистентности/карт — загрузка коллекции вне рамок), поэтому зависит и от `@alsavi/ai`, и от `@alsavi/engine` (только для создания требуемого движка). Формулировка «исключительно @alsavi/ai» смягчена соответственно. **AI Layer, Engine и их публичные API не изменялись** (git: пустой diff в `packages/engine` и `packages/ai`).
- **Ошибки:** неверные аргументы → stderr + код 2, AIService не создаётся; `ContextBudgetExceededError` → показ `actualChars`/`budgetChars`, код 1; runtime (Ollama недоступна/ECONNREFUSED) → проброс как есть, код 1, без retry/автозапуска/подмены endpoint. Успех → **ровно текст ответа модели** в stdout, без баннеров/логов, код 0.
- Тесты (+18 в `@alsavi/cli`; всего engine 45 + anki-import 18/+1 skip + backup 10 + ai 13 + cli 18): разбор аргументов и маппинг флагов; отклонение отсутствующих `--model`/`--context-budget`/вопроса, неположительного бюджета, неизвестного флага; коды возврата; **дефолт endpoint** (мок `fetch` вызван с `http://127.0.0.1:11434/api/generate` — DoD 11); явный `--endpoint`; arg-ошибка → HTTP не вызывается; `ContextBudgetExceededError` до HTTP; runtime-ошибка. **Весь HTTP мокируется `vi.stubGlobal('fetch', …)` — ни один тест не требует Ollama, CI детерминирован.**
- Документы: ARCHITECTURE.md §11d (CLI как первая пользовательская точка входа). ENGINE.md **не менялся** — Engine не изменялся.

Решения и почему:
- **Пустой in-memory движок в CLI** — минимальный способ удовлетворить обязательный `engine`, не трогая AI Layer; загрузка реальной коллекции (storage-путь, конфиг) сознательно вне TASK_012.
- **`run(argv, io)` + инъекция потоков** — вся логика тестируема без подмены process.stdout; `main.ts` тривиален.
- **`tsx` для локального запуска** — Node v24 не резолвит workspace-TS с bundler-импортами напрямую; `tsx` даёт запуск без шага сборки, оставаясь только dev-зависимостью.

Сознательно вне рамок (не делалось): HTTP API/REST/GraphQL/Web/Mobile/IPC/daemon/streaming, history/multi-turn, Retrieval/Selection/Search/embeddings, citations/sources, tokenizer, tool calling, config-файлы/dotenv/env, публикация npm, глобальная установка, имя bin.

Следующий шаг:
- Загрузка реальной коллекции пользователя в CLI (storage-путь) поверх того же `AIService`; либо выбор провайдера (Mock/Ollama) флагом; либо синхронизация/дедупликация поверх backup-формата (TASK_009).

---

## 2026-07-05 — TASK_011 (First real LLMProvider — Ollama, consumer-side, guarded)

Сделано:
- **`OllamaProvider`** (`packages/ai/src/providers/OllamaProvider.ts`) — первый реальный `LLMProvider` поверх локального Ollama. Реализует **существующий** интерфейс `LLMProvider` (`generate(prompt) → string`), ничего в него не добавляя. `POST {endpoint}/api/generate` с `{model, prompt, stream:false}`, возвращает `response`. **Endpoint и модель — только из конфигурации** конструктора (`{endpoint, model}`), без хардкода. Consumer-side, **stateless**, знает формат Ollama только он — остальные модули видят лишь абстракцию.
- **Context Budget Guard** — inline в `AIService.answer`, **между** сборкой prompt и вызовом провайдера, т.е. **до любого HTTP**. Сравнивает длину итогового prompt (в **символах**) с `contextBudgetChars` (новое **обязательное** поле `AIServiceOptions`); при превышении бросает `ContextBudgetExceededError { actualChars, budgetChars }`, провайдер не вызывается. Отдельной абстракции под одну проверку не заводил (принцип простоты; развилка по стоп-условию B была вынесена и подтверждена основателем — inline).
- **Model Window ≠ Context Budget:** Context Budget — сознательный consumer-side лимит объёма отправляемого текста в **символах**; токеновое окно модели (Model Window) — другое, токены AI Layer не считает и не токенизирует (tokenizer/подсчёт токенов запрещены и не вводились).
- **Границы соблюдены (стоп-условие A — нарушений нет):** Engine, его публичный API, Storage/DexieStore, Scheduler/FSRS, Backup/Import — **не тронуты** (git: пустой diff в `packages/engine` и его экспортах). AI Layer не получил Selection/Retrieval/Search, своего индекса/кэша/состояния. `MockProvider` остаётся штатным провайдером тестов. Контракт `AIAnswer` и интерфейс `LLMProvider` не менялись.
- DI провайдера — прежним путём (`AIService({ engine, provider, contextBudgetChars })`); `OllamaProvider` просто передаётся как `provider`.
- Тесты (+4 в `@alsavi/ai`: 7 → 11; всего engine 45 + anki-import 18/+1 skip + backup 10 + ai 11): guard в пределах бюджета → prompt уходит провайдеру; превышение → `ContextBudgetExceededError` с верными `actualChars`/`budgetChars`, **провайдер не вызван** (доказывает «до HTTP»); `OllamaProvider` через **мок `fetch`** (`vi.stubGlobal`) — правильный URL `/api/generate`, тело `{model,prompt,stream:false}`, парсинг `response`; non-OK статус → ошибка. **Ни один тест не делает реальных HTTP-запросов.** Существующие тесты AIService обновлены передачей `contextBudgetChars` (расширение ai-тестов). Границы по-прежнему enforced guard-тестами.
- Документы: ARCHITECTURE.md §11c (реальный `OllamaProvider`, Context Budget Guard, разделение Model Window / Context Budget). ENGINE.md **не менялся** — Engine не изменялся.

Решения и почему:
- **Тестирование `OllamaProvider` без реального HTTP** — через подмену глобального `fetch` (`vi.stubGlobal`), а не инъекцию `fetch` в конструктор: конфиг провайдера остаётся ровно `{endpoint, model}`, лишней зависимости конструктора нет (подтверждено основателем на развилке).
- **`contextBudgetChars` — обязательное поле**, а не дефолт: явная политика без скрытой «магической» константы (подтверждено основателем).
- **Guard в `AIService`, inline** — единственная точка, где prompt собран, но не отправлен; покрывается существующими тестами AIService, отдельный модуль под один вызов не оправдан.

Сознательно вне рамок (не делалось): реальные провайдеры кроме Ollama, второй провайдер, tokenizer/подсчёт токенов, Selection/Retrieval/Search/embeddings, streaming, citations, UI/CLI. Всё это — будущие задачи; по ADR-004 любое развитие retrieval — на стороне публичного API Engine, не AI Layer.

Следующий шаг:
- Сквозной UI/CLI поверх `AIService.answer` с выбором провайдера (Mock/Ollama) и настройкой `contextBudgetChars`; либо синхронизация/дедупликация поверх backup-формата (TASK_009).

---

## 2026-07-04 — TASK_010 (AI Layer — первый read-only consumer)

Сделано:
- Новый пакет **`packages/ai`** (`@alsavi/ai`) — **первый AI Layer** поверх ядра, независимый **read-only** потребитель. Ядро, его публичный API, Storage, Scheduler, FSRS, Backup, Import — **не тронуты** (git: нет diff в `packages/engine`); публичный API `LearningEngine` **не расширялся** (принцип №8). Точка входа `AIService.answer(question): Promise<AIAnswer>`. UI/CLI — вне рамок задачи (только программная точка входа).
- **Одна ответственность на модуль:** `ContextAssembler` (сборка контекста из Engine: `listCardViews` + `getStats`, порядок Engine, **без** ранжирования/сокращения/правки), `PromptBuilder` (чистое построение текста prompt), `AnswerGenerator` (генерация через абстракцию `LLMProvider`, не знает конкретной реализации), `providers/MockProvider` (детерминированный оффлайн-провайдер), `AIService` (**только оркестрация** ContextAssembler → PromptBuilder → AnswerGenerator → `AIAnswer`).
- **Гейт задачи пройден без остановки:** текущего публичного API Engine достаточно для необходимого контекста (`listCardViews` даёт все карты с отрендеренным контентом, `getStats` — сводку). Собственный индексатор/поиск/кэш **не потребовались** — по условию их и запрещено строить; если бы API не хватило, реализация останавливалась бы с вопросом основателю.
- **Архитектурный принцип «Engine — единственный владелец данных»** зафиксирован в ARCHITECTURE.md (§11) как **принцип, а не нумерованный инвариант**: номер INV-10 **не присвоен** (может быть оформлен позже отдельной задачей). AI Layer **stateless**: своей БД/кэша/индексов нет, контекст пересобирается из Engine на каждый вызов.
- **LLM полностью скрыта за `LLMProvider`** (`generate(prompt) → string`); детали модели знает только конкретный провайдер. `AIAnswer = { readonly answer; readonly sources? }`; `sources` зарезервировано под citations и в TASK_010 **не заполняется** (объект, а не строка — для будущих полей без ломающего изменения).
- Тесты (+7 в `@alsavi/ai`; всего engine 45 + anki-import 18/+1 skip + backup 10 + ai 7): ContextAssembler (детерминированный ожидаемый контекст на фиксированном Engine; stateless — повторный вызов видит новые данные), PromptBuilder (точный prompt на фиксированном контексте), AIService end-to-end на MockProvider (ожидаемый `AIAnswer`, `sources === undefined`; детерминизм дефолтного провайдера), два **guard-теста** (симметрично `layer boundary` ядра): ни один файл Engine не импортирует из `ai`; ни один файл `ai` не импортирует `DexieStore`/внутренние модули Storage и не делает deep-import ядра — доступ к данным только через публичный API. Старые тесты зелёные без изменений (проверено пофайлово).
- Документы: ARCHITECTURE.md (§11 переписан — AI Layer как реализованный независимый consumer + принцип владения данными; новый §11c — пакет `packages/ai`; диаграмма и §12 обновлены), ENGINE.md (§1 — граница ответственности Engine относительно AI Layer), этот PROGRESS.

Решения и почему:
- **AI Layer как отдельный пакет-потребитель**, а не слой внутри ядра или ветка в UI — прямое следствие CORE ARCHITECTURE конституции и ADR-003: параллельные независимые потребители, не звенья цепи. Тяжёлые/сетевые зависимости будущих LLM не должны протекать в чистое ядро.
- **ContextAssembler сохраняет порядок Engine и ничего не ранжирует** — намеренно, чтобы исключить дублирование поискового движка (жёсткое ограничение задачи). «Релевантность/ранжирование» — не ответственность read-only consumer.
- **AnswerGenerator отделён от LLMProvider** (сервис поверх абстракции vs. сама абстракция) — устраняет путаницу ролей; модель заменяема без изменения оркестрации.

Сознательно отложено (Phase 2+), зафиксировано как долг/направление:
- Реальные LLM-провайдеры (OpenAI/Ollama/Claude), streaming, citations/source references (поле `sources`), multi-turn диалог.
- UI/CLI сквозного сценария «пользователь → AI Layer».
- Присвоение номера INV-10 принципу владения данными — отдельной задачей, если подтвердится независимыми изменениями.
- Расширенная ответственность AI Layer из конституции (генерация карточек, объяснение ошибок, персонализация).

Следующий шаг:
- Реальный `LLMProvider` (Claude/локальная модель) за тем же интерфейсом + сквозной UI/CLI поверх `AIService`; либо синхронизация/дедупликация поверх backup-формата (TASK_009).

---

## 2026-07-03 — TASK_009 (Backup / Restore)

Сделано:
- Новый пакет **`packages/backup`** (`@alsavi/backup`) — экспорт полного самодостаточного снимка коллекции и восстановление с заменой. **Storage-концерн** через порт `EngineStore`; **публичный API `LearningEngine` НЕ расширялся** (принцип №8).
- **Порт `EngineStore` вырос на два примитива:** `listNotes()` (перечислить заметки для экспорта — раньше их нельзя было перечислить) и `replaceAll(data)` (атомарная замена; принимает только провалидированные данные — валидацию хранилище не делает). Реализовано в `MemoryStore` (тривиально) и `DexieStore` (транзакционно). `CollectionData` — тип снимка в ядре.
- **Формат:** JSON `{format:'alsavi-backup', version:1, exportedAt, data:{notes,cards,reviews}}`. Снимок включает **полный Review Log** (source of truth, ADR-002) + scheduling-кэш карт → самодостаточен и точен.
- **Безопасное восстановление (INV-9):** файл **полностью валидируется до** любой записи (структура + версия + ссылочная целостность: card→note, review→card, нет дублей id) → **явное подтверждение необратимой замены** (UI `window.confirm`) → **атомарный** `store.replaceAll` (одна Dexie `rw`-транзакция `clear`+`bulkAdd`; откат при сбое). Провал валидации/версии/транзакции → прежние данные целы.
- **Deadlock TASK_007 ЗАКРЫТ:** restore не зовёт сырой `indexedDB.deleteDatabase`, а заменяет строки транзакционно на живом соединении. Обосновано (TASK_009): при транзакционном подходе managed close/reopen **не нужен** — добавлять его = вернуть сложность жизненного цикла соединения через дверь, которую транзакция закрыла. Любое будущее удаление БД — только через Dexie-managed `db.delete()`, не сырой API.
- UI: кнопки «Экспорт (резервная копия)» (скачивание JSON) и «Восстановить из копии» (файл → валидация → предупреждение о необратимой замене → подтверждение → отчёт).
- Тесты (+10 в `@alsavi/backup`; всего engine 45 + anki-import 19 + backup 10): round-trip (export→import в чистый store → идентичность notes/cards/**Review Log**); **самодостаточность** (`rebuildCardState == restored scheduling`, привязка к TASK_005); замена (старое исчезает); битый JSON / сирота-карта / review без карты / дубли id / новая версия → отказ + **данные не тронуты**. Проверено вживую: экспорт → добавил «МУСОР» → восстановил → «МУСОР» исчез, исходные вернулись с планированием и логом; битый файл отклонён без касания данных (confirm не вызывался); reload — данные целы; зависания нет.

Гипотезы, подтверждённые реализацией/тестами (инвариант 2 задачи): атомарность через Dexie `rw`-транзакцию (`clear`+`bulkAdd`) — работает; transaction-only без managed close/reopen — подтверждено (deadlock не воспроизводится). Ограничений Dexie, требующих остановки, не обнаружено.

Тех-долг (обновление):
- ~~Deadlock при `deleteDatabase` с открытым соединением (TASK_007)~~ — **закрыто (TASK_009)**: restore не использует сырой `deleteDatabase`.
- **Сознательно отложено (Phase 2+):** merge/слияние коллекций, дедупликация, разрешение конфликтов, синхронизация между устройствами, миграция старых версий формата бэкапа (поле `version` заложено). Плюс потоковый экспорт для очень больших коллекций (сейчас снимок в память — ок для десятков тысяч).
- **Рекомендованный интеграционный rollback-тест `DexieStore.replaceAll`** (бросок из середины транзакции → прежние данные целы, напр. через `fake-indexeddb`) — **НЕ блокирует TASK_009**: архитектура и реализация завершены, атомарность проверена по правилу «без внешних await» + ручной браузерной проверкой. Это дополнительная регрессионная защита, выполнимая позже отдельным небольшим изменением.

Следующий шаг:
- AI Layer (Phase 2) — первый независимый потребитель поверх ядра; либо синхронизация/дедупликация поверх backup-формата.

---

## 2026-07-03 — TASK_008 (Basic Anki .apkg import)

Сделано:
- Новый пакет **`packages/anki-import`** (`@alsavi/anki-import`) — импорт `.apkg`, **вне ядра**, через публичный API движка (`addNote`). Два независимых слоя: **Parser** (zip `fflate` + SQLite `sql.js`/WASM → промежуточное представление `AnkiPackage`, не знает о ALSAVI) и **Mapper** (`AnkiPackage` → модель ALSAVI, не знает о zip/sqlite). Оффлайн, без сетевых зависимостей в рантайме.
- **Разведка на реальном файле** (`550_Phrasal_Verbs…apkg`, 173 МБ): пакет v2 → `collection.anki21`, schema `ver=11`; note type с 3 полями (`Front/Back/Audio`), 1 шаблон; 3745 notes/cards; revlog=0. Отчёт разведки — в диалоге TASK_008.
- **Три развилки:** (1) поддержка v2 `collection.anki21` (fallback `.anki2`); `.anki21b`/zstd и `ver≠11` — явный отказ с сообщением. (2) Non-cloze типы, `front=поле[0]`/`back=поле[1]` (лишние поля игнор), направления по **реальным `cards.ord`** (не по числу шаблонов — вернее для условных шаблонов; для подмножества эквивалентно). (3) revlog **не переносим** — карты импортируются как `state=new` (ADR-002: наш Review Log — детерминированный FSRS source of truth; SM-2-историю тащить нечестно).
- **Очистка полей → plain-text** (Mapper): удаляются `[sound:]`/HTML/`<img>`, декодируются entities. Обоснование: UI рендерит текст, не HTML/медиа; «как есть» = сломанные карточки. Медиафайлы не импортируются (нет модели медиа; Parser их даже не читает — фильтр zip).
- **`ImportReport`:** счётчики + `skippedSamples` (первые ~20 noteId+причина, для диагностики/тестов). **Семантика сбоя:** парсинг предшествует записи → плохой файл падает до единой записи (0 импортировано, понятная ошибка); сбой записи — best-effort (уже добавленные остаются) + `report.error` с фактическими счётчиками. **Не** атомарно осознанно (атомарность требовала бы нового транзакционного API движка против принципа №8, либо хрупкого отката).
- UI: кнопка «Импорт из Anki (.apkg)» в CardManager (sql.js wasm бандлится Vite локально). Импорт **добавляет** к коллекции, БД не пересоздаётся.
- Тесты (+19 в новом пакете; всего 45 engine + 19 import): Mapper на синтетике (basic→forward; basic-and-reversed→forward+reverse; 3-полевой Front/Back/Audio; cloze/<2 полей/ord≥2/пусто → skip+счёт; добавление к существующим; импортированные `new` и работают в StudySession); clean; Parser round-trip (самособранный `.apkg`) + реальный файл по `ALSAVI_TEST_APKG` (guarded). Проверено вживую: реальный файл → 3745/3745, 0 пропущено; в браузере через UI — basic+reversed+cloze → «2 заметки (3 карточки), пропущено 1: cloze», ручная карта цела, сёстры один noteId, данные пережили reload.

Технический долг (зафиксировано как видимые отложенные решения):
- **Дубликаты не обнаруживаются** — повторный импорт того же файла создаёт заметки заново. Отложено сознательно (MVP).
- **Не поддержаны сейчас:** сложные note types (3+ семантических полей, где back≠поле[1]), cloze, медиа (аудио/картинки), перенос revlog-истории/ease/интервалов, `.anki21b`/zstd. Всё — будущие задачи.
- **Парсинг qfmt/afmt** не делаем — направление берём из `cards.ord`, front/back из порядка полей; риск для нестандартных типов (back≠поле[1]) — будущее улучшение.
- **[из TASK_007] Удаление/пересоздание Dexie не защищено от открытых соединений** — `deleteDatabase` при открытом соединении даёт deadlock (наблюдалось при ручной очистке БД). Нужно: закрывать соединение перед удалением. **Критично для TASK_009 (export/import)**. Импорт этой задачи БД не удаляет (только добавляет), поэтому здесь не всплывает.

Следующий шаг:
- Export/import данных пользователя (TASK_009) — учесть deadlock-долг Dexie; либо дедупликация при импорте.

---

## 2026-07-03 — TASK_007 (Bury siblings)

Сделано (политика целиком в StudySession; Scheduler/Review Log/модель/публичный API ядра не менялись):
- **Bury siblings:** после ответа сёстры отвеченной карты (та же `noteId`, кроме самой карты) не показываются до конца текущей сессии. Гасит priming (узнавание вместо припоминания). Отвеченная карта не хоронится — возвращается по своим learning-steps/learn-ahead.
- **Единый путь ответа** `StudySession.answer(cardId, rating)` — оркестратор: делегирует запись в `engine.review()` (единственный writer в Review Log/scheduling/CardState) и обновляет только эфемерное bury-состояние. Устраняет риск рассинхрона «review + уведомление». UI (`ReviewSession`) переключён с `engine.review` на `session.answer`.
- **Эфемерное состояние:** две in-memory `Set` (answeredNoteIds, answeredCardIds) на экземпляре StudySession; **не персистится**. Новых полей Card/Note нет — сестра = тот же `noteId`.
- **dueCount() исключает погребённых** (осознанно, сохраняет инвариант TASK_002: счётчик = что реально покажет сессия).
- **Краевой случай:** единственная оставшаяся погребённая сестра не показывается — сессия завершается (в отличие от learn-ahead: показать сестру = причинить именно тот вред, ради которого bury и существует).
- **Границы сессии = время жизни экземпляра StudySession**, не календарное время; зафиксировано как архитектурный инвариант в ENGINE.md/ARCHITECTURE.md (новый экземпляр = новая сессия, независимо от того, как UI это инициирует).
- Тесты (+5, всего 45): пример A[fwd,rev]+B[fwd] → после A-fwd показывается B-fwd, не A-rev; погребённая сестра до конца сессии; новый экземпляр снова показывает; dueCount исключает погребённых; отвеченная карта возвращается по learn-ahead, сестра нет. Проверено вживую: die Blume/цветок — сестра не показана, сессия завершилась, после reload сестра снова видна.
- В Architecture Principles добавлен принцип №8 «Минимальный публичный API ядра» — подтвердился естественно (bury-политику держали в StudySession, ядро не расширяли).

Решения и почему:
- Единый путь через сессию выбран вместо двух вызовов после разбора: он делает рассинхрон невозможным и проще для UI; не противоречит отклонённому ранее варианту «сессия оборачивает review», т.к. запись остаётся в `engine.review` — сессия лишь оркеструет.

Тех-долг (обновление статуса):
- ~~bury siblings (карты одной заметки подряд в сессии)~~ — **закрыто (TASK_007)**.

Следующий шаг:
- Экспорт/импорт данных пользователя (Review Log самодостаточен после TASK_005); либо явная кнопка «Новая сессия» в UI (пересоздаёт StudySession → сбрасывает bury).

---

## 2026-07-02 — TASK_006 (Indexed reads: due-horizon + Card/Note join)

Сделано (оптимизация, наблюдаемое поведение не менялось):
- **Due-horizon:** `StudySession.selectEligible` больше не сканирует все карты (`listCards()`), а использует индексированный range-запрос через новый публичный метод ядра `LearningEngine.getCardsDueBy(threshold)` → `store.listDueCards(threshold)` (индекс `due` уже был). Policy (learn-ahead, сортировка due→id, партиционирование) осталась в StudySession без изменений. **Публичный API-метод согласован отдельно** (форма `getCardsDueBy(threshold)`).
- **N+1 в CardView:** `engine.listCardViews()` вместо поэлементных `getNote()` делает один батч `EngineStore.getNotesByIds(ids)` с дедупликацией noteId (заметки-сёстры читаются один раз). `getCardView()` (одна карта) не менялся.
- `EngineStore` расширен одним batch-примитивом `getNotesByIds` (Dexie `bulkGet`, Memory — map-лукапы) — остаётся хранилищем, не query-построителем.
- **Миграция не потребовалась**: индекс `due` и таблица `notes` уже существовали (TASK_003). Схема Dexie не менялась; проверено вживую — существующие локальные данные (3 карты / 2 заметки / 3 повторения) целы, сессия/счётчик/список работают идентично.
- Тесты (+4, всего 40): `getCardsDueBy` == фильтр `listCards(due<=threshold)`; сессия == прежнее full-scan-поведение; инструментированный store — `nextCard/dueCount` не зовут `listCards`, зовут `listDueCards`; `listCardViews` == per-card `getCardView`, `getNote` не вызывается, `getNotesByIds` один раз с дедуплицированными id.

Решения и почему:
- Индексный запрос отдан StudySession через **публичный API ядра** (`getCardsDueBy`), а не прямым доступом к хранилищу — граница ADR-003 сохранена. Это факт-запрос той же природы, что `getDueCards`; policy остаётся в сессии.
- Отдельного теста производительности на больших объёмах нет — в проекте нет bench-инфраструктуры; эквивалентность и отсутствие полного скана/N+1 доказаны инструментированными счётчиками вызовов store.

Тех-долг (обновление статуса):
- ~~Due-horizon: `listCards()` full scan в StudySession~~ — **закрыто (TASK_006)**.
- ~~N+1 чтений заметок в `listCardViews`~~ — **закрыто (TASK_006)**.

Следующий шаг:
- «bury siblings» для карт одной заметки; либо экспорт/импорт данных пользователя.

---

## 2026-07-02 — TASK_005 (Review Log Replay / CardState reconstruction)

Сделано:
- Закрыт открытый вопрос replay: `LearningEngine.rebuildCardState(cardId)` пересчитывает `CardState` **только из Review Log** (seed `initialSchedule(createdAt)` → `applyRating(card, rating, reviewedAt)` по возрастанию времени). Чистая утилита `replayCardState` (`packages/engine/src/replay.ts`).
- **Схему лога менять не потребовалось**: из-за детерминизма Scheduler для replay достаточно `rating`+`reviewedAt` (оба всегда хранились); `reps/lapses/learningSteps/lastReview` пересчитываются, а не читаются. Ни новых полей, ни миграции.
- **Инвариант реализации:** seed использует только идентификационные поля карты (`id/noteId/template/deckId/createdAt`); `due/state/scheduling` как вход полностью игнорируются. Операция чистая (лог не мутируется, ничего не персистится).
- Тесты (+4): эквивалентность replay ↔ кэш на разных историях (Again×N, Learning→Review, смешанные); карта без повторений; **намеренное повреждение `due`/`scheduling`** — реконструкция восстанавливает состояние только из лога; missing card → undefined. Всего 36, зелёные.
- Существующее поведение (`review`/`getDueCards`/`previewIntervals`) не изменено; граница Engine/AI цела (`replay.ts` под тестом `layer boundary`).
- Документы: `ARCHITECTURE.md` §10 (открытый вопрос закрыт, метод описан), `ENGINE.md`, комментарий `Review` в `types.ts`.

Тех-долг (обновление статуса):
- ~~Открытый вопрос replay Review Log → scheduling~~ — **закрыто (TASK_005)**.
- Возможное развитие: «repair»-вариант (персистит пересчитанное состояние, напр. после смены параметров FSRS); оптимизация replay на очень длинной истории (сейчас O(n) по числу повторений).

Следующий шаг:
- «bury siblings» для карт одной заметки; либо экспорт/импорт данных пользователя (Review Log уже самодостаточен для этого).

---

## 2026-07-02 — TASK_004 (Session Hotkeys)

Сделано:
- Хоткеи в `ReviewSession` (чистый UI-слой): `Пробел` — показать ответ; `1/2/3/4` — Снова/Трудно/Хорошо/Легко. Обработчик `keydown` на `window`, монтируется/снимается с компонентом; игнорируется при фокусе в input/textarea/contentEditable и при зажатых Ctrl/Cmd/Alt; `Пробел`/цифры — `preventDefault` (нет скролла страницы).
- Ненавязчивые подсказки: «Пробел» под кнопкой показа, «1 · 2 · 3 · 4» под кнопками ответов. Дизайн кнопок не менялся.
- `LearningEngine`, `StudySession`, модель данных — **не тронуты**. UI-тестов в проекте нет — инфраструктуру не заводил (по условию задачи), проверка ручная.
- Проверено: полный проход сессии только с клавиатуры (Space→reveal, 3→Good, Space→1→Again), счётчики/точность обновляются, переход к следующей карте без кликов.

Следующий шаг:
- «bury siblings» для карт одной заметки и/или закрытие открытого вопроса replay Review Log → scheduling.

---

## 2026-07-02 — TASK_003 (Data Model: Note + Multi-Card)

Сделано:
- Введена сущность **`Note`** — единственный источник истины для контента. `Card` больше **не хранит** `front/back`: карта несёт `noteId + template ('forward'|'reverse')`, а контент вычисляется чистой функцией `renderCard(card, note)` (`packages/engine/src/render.ts`). Дрейф контента между сёстрами структурно невозможен.
- API движка: `addNote({front, back, directions})` → Note + 1..N карт; `addCard` сохранён как сахар (Note 1:1 forward); `updateNoteContent` — основной путь редактирования; `deleteNote` (каскад), `deleteCard` (удаляет заметку, если карта была последней); `getNote`, `getCardView`, `listCardViews`. `updateCardContent` — `@deprecated` мостик: только forward-карта без сестёр, иначе бросает ошибку; **в UI-путях не используется**.
- `EngineStore` + `MemoryStore`: добавлены `getNote/putNote/deleteNote`.
- `DexieStore`: схема `version(2)` (таблица `notes`, индекс `noteId`) + **автоматическая non-breaking миграция** — каждой v1-карте создаётся синтетическая Note 1:1 (контент → поля заметки, `template='forward'`), планирование и Review Log сохранены. Проверено вживую: v1-карта «das Wort» мигрировала без потери данных (state=learning, reps=1, 1 review).
- UI: `ReviewSession` показывает контент через `getCardView`; `CardManager` — чекбокс «Создать также обратную карточку» (`addNote(['forward','reverse'])`) + `listCardViews`. Проверено: «der Tag» с галочкой → 2 карты одной заметки (прямая и обратная).
- Тесты: +6 в `engine.test.ts` (forward+reverse, редактирование заметки → все сёстры, независимое планирование сестёр, дефолт/сахар, каскад удаления, guard `updateCardContent`); тест редактирования переориентирован на `updateNoteContent`; фикстура `study-session.test.ts` обновлена. Всего 32, зелёные.

Решения и почему:
- **Контент — только в Note** (по корректировке основателя): без дублирования `front/back` на карте, единая точка истины; `updateNoteContent` ничего не «перерисовывает» — карты рендерят из заметки на чтении.
- **SRP сохранён**: Scheduler/Review Log работают пер-карта (Note им невидим); StudySession читает `due/state` (не менялся по сути, только фикстура теста); LearningEngine получил CRUD заметок — та же его ответственность (контент+карты).
- **Deck/CardType сознательно не реализованы**: `deckId` — строка, `template` — ограниченный enum, не движок шаблонов. Модель допускает их позже без ре-миграции Note.
- Документы обновлены: `ENGINE.md`, `ARCHITECTURE.md` (Note-модель, INV-8, API/EngineStore, миграция).

Тех-долг (обновление):
- `listCardViews()` — N+1 чтений (карта→заметка); для MVP ок, позже — джойн/кэш.
- «bury siblings» (разнесение карт одной заметки) — сознательно отложено; кандидат на будущую политику StudySession.
- Открытый вопрос replay Review Log → scheduling — остаётся (ARCHITECTURE §10).

Следующий шаг:
- Хоткеи в ReviewSession (1–4 / пробел); затем «bury siblings» и/или закрытие replay отдельной задачей.

---

## 2026-07-02 — TASK_002 (dueNow counter vs learn-ahead)

Сделано:
- Закрыт тех-долг из TASK_001: счётчик «К повторению» больше не рассинхронизируется с learn-ahead. Теперь он отражает то же множество, что реально покажет `StudySession.nextCard()` (due-now + learning/relearning в окне learn-ahead).
- В `StudySession` добавлен `dueCount()`; выборка вынесена в приватный `selectEligible(now)`, которым пользуются и `nextCard()`, и `dueCount()` — **единый предикат, нулевое дублирование** learn-ahead.
- UI: `StudySession` поднят в `App` (единственный инстанс), счётчик считается через `session.dueCount()`; `ReviewSession` принимает сессию пропсом (общий learnAhead у счётчика и потока).
- `LearningEngine` **не менялся** (`getStats().dueNow` остаётся строгим engine-статом, его используют тесты ядра).
- Тесты: +4 в `study-session.test.ts` (learning +5м считается, +30м нет; будущий review не тянется; сумма due+learn-ahead; инвариант dueCount==0 ⇔ nextCard==null). Всего 26, зелёные.
- Ручной сценарий: 1 карточка → «Снова» → счётчик остаётся 1 (не падает в 0), карточка видна.

Решения и почему:
- Фикс — на уровне `StudySession` (не ядра и не UI-дублированием): learn-ahead — это session-политика, её место в слое сессии (ADR-003). UI лишь читает `dueCount()`.
- Подпись «К повторению» оставлена без изменений: смысл (сколько карточек к показу сейчас) сохранён и стал точнее; переименование не требуется.

Тех-долг (обновление статуса):
- ~~Рассинхрон «К повторению» с learn-ahead~~ — **закрыто (TASK_002)**.
- Перф `listCards()` на каждый `nextCard()`/`dueCount()` — остаётся (O(n)); индексированный запрос горизонта — будущая оптимизация.

Следующий шаг:
- Хоткеи в ReviewSession (1–4 / пробел); затем открытый вопрос replay Review Log → scheduling отдельной задачей.

---

## 2026-07-02 — TASK_DOCS_001 (Architecture & Engineering Documentation)

Сделано:
- Создан `ARCHITECTURE.md` — источник архитектурной истины: общая модель и диаграмма (StudySession и AI Layer — **параллельные независимые потребители** публичного API `LearningEngine`, не звенья цепи), принципы, инварианты (INV-1…INV-7), описания LearningEngine/StudySession/Scheduler/EngineStore/Review Log, AI Layer как будущий потребитель, Future Architecture (направление, не контракт), открытый вопрос replay, правила обновления.
- Создан `ENGINE.md` — введение в ядро для нового разработчика: назначение LearningEngine, ответственность StudySession (поток сессии, не расчёт памяти), Scheduler, EngineStore, CardState, Review Log, жизненный цикл карточки, поток данных, ключевые решения.
- Создана папка `docs/adr/` + ADR-001 (Scheduler abstraction), ADR-002 (Review Log as Source of Truth), ADR-003 (StudySession separation, с SRP-анализом и Вариантом B-minimal из TASK_001) + `README.md`-индекс.
- Завершён TASK_001 (Learning Steps) — зафиксирован официально в архитектурных документах.

Решения и почему:
- Документация фиксирует **только фактическое** состояние кода; терминология AI Layer/StudySession взята дословно из `PROJECT_CONSTITUTION.md` (commit 00972bb) и согласована во всех новых документах.
- Код проекта не изменялся (задача сугубо документационная).

Расхождение код ↔ документы (зафиксировано как открытый вопрос, не исправлялось):
- Комментарии в `types.ts` заявляют lossless-replay Review Log → scheduling, но функции replay нет, а `Review` не хранит `reps/lapses/learningSteps/lastReview`. Восстановление возможно пересчётом через детерминированный Scheduler, не чтением полей. Это незакрытый стратегический инвариант (см. `ARCHITECTURE.md` §10, ADR-002), а не баг. Тех-долг ниже сохраняется.

Следующий шаг:
- Хоткеи в ReviewSession (1–4 / пробел); затем дневной лимит новых карт в StudySession и undo. Перед следующим релизом — закрыть открытый вопрос replay отдельной задачей.

---

## 2026-07-02 — TASK_001 (Learning Steps)

Сделано:
- Новый слой сессии `StudySession` (`packages/engine/src/study-session.ts`) — отдельная ответственность «поток учебной сессии», отделён от `LearningEngine` (память). Использует только публичный API движка (`listCards`), сам движок **не менялся**.
- `StudySession.nextCard()`: приоритет — реально due-карточки (`due <= now`, порядок по `due`, tie-break по `id`); иначе learning/relearning-карточка в окне learn-ahead. Итог: после «Снова»/«Трудно»/«Хорошо» карточка возвращается **в ту же сессию**, без перезапуска приложения. Learning steps как таковые уже считал FSRS — разрыв был в слое сессии, а не в алгоритме.
- `learnAheadMinutes` (дефолт 20) — эргономический knob (не даёт «хвостовой» learning-карточке упереться в экран «Готово» и ждать таймер). Это **не** когнитивная константа: значимая для памяти дистанция живёт в FSRS review-интервалах. Значение обосновано (покрывает шаги 1m/10m с запасом), настраивается программно, обратимо.
- UI (`ReviewSession.tsx`): переключён с `getDueCards` на `StudySession.nextCard()`; добавлен бейдж состояния карточки (новая / изучается / на повторении / переучивается) — Этап 6, без редизайна и новых функций.
- Тесты: `study-session.test.ts` (8) + расширение `engine.test.ts` (learning-steps переходы Again/Hard/Good/Easy, Learning→Review, повторное появление в сессии, детерминизм). Всего 22, все зелёные.
- Проверено вживую: Снова → возврат в сессии; добивание Хорошо → выпуск в Review → экран «Готово»; reload + сохранность IndexedDB (state=review, reps=3, reviewCount=3).

Решения и почему:
- **Вариант B-minimal** (StudySession отдельно от LearningEngine), а не метод `getNextCard()` на движке: SRP — у ядра остаётся одна причина меняться (алгоритм памяти), у сессии другая (поток/порядок/learn-ahead). Шов «расписание ↔ поток» делаем явным заранее (как границу Engine/AI), т.к. добавлять его задним числом дорого. Полноценный фреймворк режимов (Voice/Reading/Exam) сознательно **не** проектировал — только сегодняшняя нужда.
- Порядок выборки — по `due` (без Anki-приоритета learning над new) — осознанное упрощение MVP.

Тех-долг (появился/зафиксирован):
- `StudySession.nextCard()` вызывает `engine.listCards()` на каждый шаг — O(n) на выборку. Для MVP-объёмов ок; позже — индексированный запрос горизонта (потребует аккуратного расширения `EngineStore`, не публичного API движка).
- Статистика «К повторению» = строго `due <= now` и **не** учитывает learning-карточки, показываемые через learn-ahead → счётчик может показывать 0, пока карточка ещё изучается в сессии. Не критично; решить при доработке статистики/дневных лимитов.
- Отсутствует `ARCHITECTURE.md` (оформить отдельной задачей). `PROJECT_CONSTITUTION.md` создан в TASK_DOCS_000.
- **Рекомендация для будущего `ENGINE.md` / `ARCHITECTURE.md`:** задокументировать replay Review Log → scheduling (перестроение scheduling-состояния карточки из append-only лога повторений). Сознательно НЕ вносится в Конституцию (это архитектурная деталь, не философия); ждёт создания технических документов.
- Interleaving new/learning-приоритета нет — кандидат на улучшение качества сессии.

Следующий шаг:
- Хоткеи в ReviewSession (1–4 для ответов, пробел — показать). Затем дневной лимит новых карточек в `StudySession` и undo последнего ответа.

---

## 2026-07-02

Сделано:
- Монорепо (npm workspaces): `packages/engine` (@alsavi/engine) + `apps/web` (@alsavi/web).
- Learning Engine: модель Card/Review, публичный API `LearningEngine` (addCard, review, getDueCards, previewIntervals, getStats, edit/delete), порт хранилища `EngineStore` + `MemoryStore`.
- FSRS за интерфейсом `Scheduler` (обёртка над ts-fsrs 5.4.1, fuzz выключен → полный детерминизм).
- 11 тестов (vitest): жизненный цикл карточки, детерминизм расписания (регрессионный страж памяти), порядок интервалов, независимость редактирования от планирования, статистика, тест-страж границы слоёв (в src ядра нет fetch/network/AI).
- Web-приложение: Vite + React 19, `DexieStore` (IndexedDB-адаптер порта), экраны «Повторение» (front → ответ → 4 кнопки с интервалами) и «Карточки» (добавление/список/удаление), статус-бар (due/всего/сегодня/точность/серия). UI на русском.
- Проверено вживую end-to-end: добавление → повторение → интервалы FSRS на кнопках → статистика → персистентность после reload.

Решения и почему:
- **FSRS** (не SM-2): стандарт нового Anki, меньше повторений при той же удержке; вероятностная модель, но детерминированный расчёт — допустимое исключение по брифу.
- **Web** первым таргетом: скорость итераций, позже PWA/мобильная обёртка.
- **TypeScript-монорепо**: один язык до работающего продукта; Rust/WASM-ядро — возможная замена в Phase 4, граница Scheduler делает её локальной.
- **Лог повторений — source of truth**: `Review` хранит достаточно состояния для полного replay; scheduling-состояние на карточке — кэш. При удалении карточки лог сохраняется.
- **ts-fsrs спрятан за `Scheduler`**, хранилище — за `EngineStore`: оба решения обратимы без переписывания ядра.
- Удаление карточки — hard delete карточки, но лог остаётся (для статистики и будущих re-fit параметров).

Отложено и почему:
- Внутрисессионные learning steps (карточка «Снова» возвращается в ту же сессию через 1 мин): сейчас сессия берёт только due-карточки на момент запроса; нужна очередь сессии с ожиданием ближайшего due. Первый кандидат на следующую сессию — влияет на обучение напрямую.
- Undo последнего ответа, кнопки-хоткеи (1–4, пробел), несколько колод, экспорт/импорт данных — по мере надобности, всё ложится на существующий лог.
- Rebuild расписания из лога (функция replay) — понадобится при смене/оптимизации параметров FSRS.
- npm-кэш пользователя сломан правами root: ставил с `--cache` в scratchpad. Постоянное лечение: `sudo chown -R 502:20 ~/.npm`.

Следующий шаг:
- Внутрисессионные learning steps + хоткеи в ReviewSession; затем undo. После этого Phase 1 близка к end-to-end готовности (останется отшлифовать статистику).

Команды: `npm test` (тесты ядра), `npm run dev` (web на :5173), typecheck: `npx tsc --noEmit` в каждом пакете.
