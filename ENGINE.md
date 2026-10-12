# ENGINE — руководство по ядру ALSAVI

Этот документ объясняет ядро ALSAVI разработчику, который впервые открыл проект.
Более высокоуровневая карта — в [`ARCHITECTURE.md`](ARCHITECTURE.md); философия и
принципы — в [`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md); архитектурные
решения с обоснованием — в [`docs/adr/`](docs/adr/).

Код ядра: `packages/engine` (пакет `@alsavi/engine`, чистый TypeScript,
единственная рантайм-зависимость — `ts-fsrs`). Веб-приложение —
`apps/web` (React 19 + Vite), потребитель ядра.

---

## 1. Что такое LearningEngine

`LearningEngine` (`src/engine.ts`) — детерминированное **ядро памяти** и
единственная точка входа к карточкам и расписанию. Всё, что снаружи пакета
(UI, AI Layer, anki-import, backup), работает с картами и расписанием
**только** через этот класс. Ядро полностью автономно: ни сети, ни AI.

**Граница ответственности относительно AI Layer (TASK_010).** Engine —
**единственный владелец данных**. AI Layer (`packages/ai`) — независимый
**read-only** потребитель этого публичного API, равноправный с UI и
StudySession; Engine **ничего не знает** о его существовании и работает в полном
объёме без него. Симметрия границы: как ядро не имеет доступа к сети/AI (тест
`layer boundary`), так AI Layer не имеет прямого доступа к Storage — все знания
он получает исключительно из Engine, не создавая собственного Storage, поиска,
embeddings или индексов (см. `ARCHITECTURE.md` §11, §11c). Публичный API ядра
ради AI Layer **не расширялся** (принцип №8).

Ответственность ядра: хранить заметки и карточки, применять ответы пользователя
к расписанию (через `Scheduler`), вести журнал повторений (Review Log) и считать
статистику. Ядро **не** решает, какую карту показать следующей в сессии — это
ответственность `StudySession` (см. §2).

Публичный API: `addNote`, `addCard` (сахар 1:1), `updateNoteContent`,
`archiveNote`, `unarchiveNote`, `deleteNote`, `deleteCard`, `getNote`, `getCard`, `getCardView`, `listCards`,
`listCardViews`, `getDueCards`, `getCardsDueBy`, `rebuildCardState`, `review`,
`previewIntervals`, `getStats`. `updateCardContent` — `@deprecated` мостик
(только forward-карта без сестёр, иначе бросает ошибку; в UI не используется).

### Note → Card (1:N)

**`Note` — единственный источник истины для контента.** Одна заметка порождает
одну или несколько карт (`addNote({front, back, directions})`,
`directions: ('forward'|'reverse')[]`). Карта **не хранит** свой `front/back` —
они вычисляются из заметки чистой функцией `renderCard(card, template)`
(`forward` → как есть; `reverse` → стороны меняются местами). Поэтому:

- редактирование через `updateNoteContent(noteId, …)` мгновенно отражается на
  всех картах-сёстрах — рассинхронизация контента структурно невозможна;
- у каждой карты заметки **своё независимое** планирование и `state`;
- UI получает готовый к показу контент через `getCardView(id)` /
  `listCardViews()` — логика рендера живёт в одном месте (ядро); `CardView`
  несёт и саму заметку (`view.note`) — для списка/поиска/редактирования.

**Необязательные поля заметки (TASK_023):** `example` (пример), `memo` (личная
заметка), `tags` (теги), `archivedAt` (архив). Старые заметки хранятся как
есть, без миграции и без смены схемы IndexedDB; чтения ядра (`getNote`,
`getCardView`, `listCardViews`) отдают отсутствующие `tags` как `[]`. Ядро
нормализует теги на каждой записи (`normalizeTags`: trim, схлопывание пробелов,
без ведущего `#`, нижний регистр, без пустых и дублей). `updateNoteContent`
пишет **только** строку заметки (тот же id): не трогает карты, scheduling и
Review Log; `undefined` в необязательном поле = «оставить как есть», пустая
строка = «убрать».

**Архив вместо удаления (TASK_023).** `archiveNote(noteId)` ставит
`archivedAt` и больше ничего не меняет: заметка, карты (со scheduling) и Review
Log целы. Карты архивной заметки исключаются из `getDueCards`/`getCardsDueBy`
(а значит, из любой очереди `StudySession`) и из счётчиков карт `getStats`
(`totalCards`/`newCards`/`dueNow`); статистика по логу (сегодня, точность,
серия) историю сохраняет. `unarchiveNote` возвращает заметку с тем же
расписанием. Оба идемпотентны. UI предлагает только архив: жёсткое
`deleteCard`/`deleteNote` у карты с историей оставляет в логе повторения без
карты, а такой бэкап `parseBackup` отклоняет (см. PROGRESS.md, TASK_023).

`addNote` — это тот же публичный шов, через который импорт Anki
(`packages/anki-import`, отдельный пакет-потребитель вне ядра) создаёт заметки;
см. `ARCHITECTURE.md` §11a.

`Deck` (сейчас `deckId` — строка) и `CardType` (система шаблонов) **не**
реализованы — `template` пока ограниченный enum. См. ADR/ARCHITECTURE.

Зависимости внедряются через конструктор (`EngineOptions`): `store`
(обязателен), `scheduler` (по умолчанию `FsrsScheduler`), `now()` и `newId()`
(инъектируются в тестах для детерминизма).

## 2. Ответственность StudySession

`StudySession` (`src/study-session.ts`) — **детерминированный слой учебного
потока**, сознательно отделённый от ядра. Он решает *какую карточку показать
следующей*, но **не рассчитывает память**.

Почему отдельно: у ядра и у потока сессии **разные оси изменения**.
- Ядро меняется, когда меняется модель памяти (алгоритм SRS, модель карты,
  хранилище).
- Поток сессии меняется, когда меняется политика подачи (порядок, learn-ahead,
  будущие дневные лимиты, interleaving, режимы).

Смешивать их в одном классе — нарушать принцип единственной ответственности.
Полное обоснование и рассмотренные варианты (A: метод `getNextCard()` на ядре;
B-minimal: отдельный `StudySession`; B-full: фреймворк режимов) —
в [ADR-003](docs/adr/ADR-003-studysession-separation.md). Выбран B-minimal.

Контракт: `StudySession` обращается к ядру только через публичный API — для
выборки использует индексированный `engine.getCardsDueBy(now + learnAheadMs)`
(range-запрос по `due`), а не полный скан; ничего не пишет в хранилище, не
трогает scheduling. Методы — `nextCard()`, `dueCount()` и `answer(cardId, rating)`.

**`answer()` — только оркестратор.** Единственная операция записи в Review Log,
scheduling и CardState остаётся `LearningEngine.review()`; `answer()` делегирует
запись ей и лишь обновляет своё эфемерное состояние сессии. Один вход исключает
рассинхрон «запись + обновление очереди».

**Bury siblings.** После ответа остальные карты той же заметки (сёстры) не
показываются до конца текущей сессии — это гасит priming (узнавание вместо
припоминания). Сама отвеченная карта не хоронится (может вернуться по своим
learning-шагам). Политика чисто in-memory: две эфемерные `Set` (отвеченные
заметки и карты) на экземпляре; `dueCount()` исключает погребённых, сохраняя
инвариант «счётчик = что реально покажет сессия». Если после bury осталась только
погребённая сестра — сессия завершается, карта не показывается досрочно (в
отличие от learn-ahead: показать сестру = причинить именно тот вред, ради
предотвращения которого bury и существует).

**Границы учебной сессии — это время жизни экземпляра `StudySession`, а НЕ
календарное время.** Bury-состояние живёт ровно столько, сколько живёт экземпляр,
и никогда не персистится. «Начать новую сессию» = создать новый `StudySession`;
это архитектурный инвариант, а не свойство текущего UI. Сейчас в вебе новый
экземпляр совпадает с перезагрузкой страницы, но если появится, например, кнопка
«Новая сессия» без перезагрузки — поведение bury определяется созданием нового
экземпляра, а не способом реализации интерфейса.

## 3. Scheduler

`Scheduler` (`src/scheduler.ts`) — граница алгоритма SRS:

```ts
interface Scheduler {
  initialSchedule(now: number): ScheduleUpdate;
  applyRating(card: Card, rating: Rating, now: number): ScheduleUpdate;
  preview(card: Card, now: number): IntervalPreview;
}
```

Реализация — `FsrsScheduler` (`src/fsrs-scheduler.ts`), обёртка над `ts-fsrs`
с **выключенным fuzz** (детерминизм). Она переводит доменные типы ALSAVI
(`Card`, `Rating`, `CardState`) в типы ts-fsrs и обратно. Learning steps
(`1m`, `10m`) и переходы состояний обеспечивает FSRS. Заменить алгоритм = дать
новую реализацию `Scheduler`, не трогая ядро, хранилище и UI. См.
[ADR-001](docs/adr/ADR-001-scheduler-abstraction.md).

## 4. EngineStore

`EngineStore` (`src/store.ts`) — порт хранилища. Ядро зависит только от
интерфейса. Реализации:

- `MemoryStore` (`src/memory-store.ts`) — in-memory, для тестов и как эталон;
- `DexieStore` (`apps/web/src/dexie-store.ts`) — IndexedDB для веба.

Методы: `getNote/getNotesByIds/listNotes/putNote/deleteNote`,
`getCard/putCard/deleteCard`, `listCards`, `listDueCards`, `appendReview`,
`listReviews`, `replaceAll`. `getNotesByIds` — batch-примитив (bulk get по
ключам) без N+1; `listNotes` — все заметки (для экспорта бэкапа);
`listDueCards(threshold)` — индексированный range-запрос по `due`; `replaceAll` —
атомарная замена всей коллекции (restore, TASK_009), принимает только
провалидированные данные. `appendReview` — только добавление; `listReviews` — по
возрастанию времени. При `deleteCard` журнал повторений намеренно **не**
удаляется. Backup/restore (`packages/backup`) — storage-потребитель через этот
порт; публичный API движка не расширяется. См.
[ADR-002](docs/adr/ADR-002-review-log-source-of-truth.md).

`DexieStore` версионирует схему: `version(2)` вводит таблицу `notes` и индекс
`noteId` на `cards`; автоматическая `upgrade`-миграция создаёт синтетическую
заметку 1:1 для каждой карты v1 (контент → поля заметки, `template='forward'`),
сохраняя планирование и Review Log. Миграция non-breaking, без потери данных.

**Порядок перечисления — часть контракта (TASK_014).** `listCards()` и, как
следствие, `listCardViews()` возвращают карты в едином детерминированном,
стабильном, тотальном порядке: по возрастанию `card.id` (лексикографически, как
порядок строковых ключей IndexedDB). Все реализации `EngineStore` обязаны
соблюдать этот порядок: `MemoryStore` явно сортирует по `id` на чтении,
`DexieStore` — `orderBy('id')` (не полагаясь на побочный эффект `toArray()`).
Раньше порядок был не специфицирован и различался между адаптерами. **Изменение
нормативного порядка — breaking architectural change: только через отдельный ADR
и отдельную задачу.** Область — исключительно `listCards`/`listCardViews`; не
затрагивает `listDueCards` (порядок по `due`) и не вводит Selection/Retrieval/
Search/фильтрацию.

## 5. CardState

`CardState = 'new' | 'learning' | 'review' | 'relearning'` (`src/types.ts`).

- `new` — создана, ещё не отвечали; due немедленно.
- `learning` — проходит короткие learning-шаги (после Again/Hard/Good на новой).
- `review` — «выпущена», интервалы измеряются днями.
- `relearning` — провалена после review (Again), проходит relearning-шаги.

Состояние фиксируется в каждом `Review` (`stateBefore`/`stateAfter`) и полностью
воспроизводимо из журнала методом `rebuildCardState` (§9 и `ARCHITECTURE.md` §10).

## 6. Review Log

Append-only журнал ответов — **source of truth**. `SchedulingState` на карте —
производный кэш. Каждый `Review` (`src/types.ts`) содержит: `id`, `cardId`,
`rating`, `reviewedAt`, `stateBefore`, `stateAfter`, `dueAfter`, `stability`,
`difficulty`, `scheduledDays`.

## 7. Жизненный цикл карточки

```
addNote({directions})→ Note + 1..N Card, каждая state=new, due=now
addCard()            → state=new,        due=now              (сахар: Note 1:1 forward)
review(Again)        → state=learning,   due≈+1m              +1 Review в лог
review(Hard/Good)    → state=learning,   due≈+6m / +10m       (проходит шаги)
review(Good) ×N      → state=review,     due=+дни             («выпуск»)
review(Easy) на new  → state=review,     due=+дни             (сразу выпуск)
review(Again) в review → state=relearning, due≈+10m           lapses++, relearning-шаги
updateNoteContent()  → контент всех карт-сестёр меняется, due/scheduling НЕ меняются
archiveNote()        → карты заметки уходят из очередей/счётчиков; ничего не удаляется; due/scheduling/лог целы
unarchiveNote()      → карты возвращаются в очереди с прежним расписанием
deleteCard()         → карта удалена (+ заметка, если это была последняя); Review Log сохранён
deleteNote()         → заметка и все её карты удалены; Review Log сохранён
```

Точные интервалы задаёт FSRS; конкретные минуты выше — иллюстративны.

## 8. Поток данных

Запись ответа (UI → сессия-оркестратор → ядро):
```
UI (ReviewSession)
  └─ studySession.answer(cardId, rating)              // единый путь ответа
       ├─ engine.review(cardId, rating)               // ЕДИНСТВЕННЫЙ writer
       │    ├─ scheduler.applyRating(card, rating, now)   // расчёт расписания
       │    ├─ store.putCard(updatedCard)                 // кэш карты
       │    └─ store.appendReview(review)                 // append в source of truth
       └─ bury siblings (эфемерно, в памяти сессии)   // не пишет в хранилище
```

Выбор следующей карты + её контент (UI → поток сессии → ядро):
```
UI (ReviewSession)
  ├─ studySession.nextCard()               // какую карту показать (due/state)
  │    └─ engine.getCardsDueBy(now+window)  // индексированный range-запрос по due
  │       → политика: due<=now по due; иначе learning/relearning в learn-ahead
  └─ engine.getCardView(card.id)           // контент карты, отрисованный из её заметки
```

UI одновременно вызывает и `StudySession` (что показать), и `LearningEngine`
(записать ответ, превью, статистика). AI Layer в будущем — **ещё один
независимый потребитель** ядра, параллельный этим двум, а не звено цепи.

## 9. Основные архитектурные решения

- **Детерминизм ядра** (fuzz off, инъекция часов/id) — регрессия расписания
  ловится тестами.
- **Порты `Scheduler` и `EngineStore`** делают алгоритм и хранилище
  заменяемыми без изменения контракта ядра.
- **Review Log как source of truth**, scheduling — кэш ([ADR-002]).
- **StudySession отделён от ядра** по осям изменения ([ADR-003]).
- **Replay реализован:** `LearningEngine.rebuildCardState(cardId)` пересчитывает
  `CardState` из лога через детерминированный `Scheduler`
  (`replayCardState`, `src/replay.ts`); покрыт тестом эквивалентности, включая
  случай повреждённого кэша (`ARCHITECTURE.md` §10). Схема лога не менялась.

## 10. Команды

- `npm test` — тесты ядра (vitest) из корня.
- `npm run dev` — web dev-сервер на http://localhost:5173.
- typecheck: `npx tsc --noEmit` внутри пакета.

Тесты ядра: `packages/engine/test/engine.test.ts` (жизненный цикл, learning
steps, детерминизм, статистика, `layer boundary`) и `study-session.test.ts`
(поток сессии, learn-ahead, детерминизм).

[ADR-001]: docs/adr/ADR-001-scheduler-abstraction.md
[ADR-002]: docs/adr/ADR-002-review-log-source-of-truth.md
[ADR-003]: docs/adr/ADR-003-studysession-separation.md
