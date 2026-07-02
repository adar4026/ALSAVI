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
(сегодня UI, позже AI Layer), работает с картами и планированием **только**
через этот класс. Ядро полностью автономно: ни сети, ни AI.

Ответственность ядра: хранить карточки, применять ответы пользователя к
расписанию (через `Scheduler`), вести журнал повторений (Review Log) и считать
статистику. Ядро **не** решает, какую карту показать следующей в сессии — это
ответственность `StudySession` (см. §2).

Публичный API: `addCard`, `updateCardContent`, `deleteCard`, `getCard`,
`listCards`, `getDueCards`, `review`, `previewIntervals`, `getStats`.

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

Контракт: `StudySession` обращается к ядру только через публичный
`engine.listCards()`, ничего не пишет в хранилище, не трогает scheduling.
Единственный метод — `nextCard(): Promise<Card | null>`.

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
новую реализацию `Scheduler`, не трогая ядро, хранилище и UL. См.
[ADR-001](docs/adr/ADR-001-scheduler-abstraction.md).

## 4. EngineStore

`EngineStore` (`src/store.ts`) — порт хранилища. Ядро зависит только от
интерфейса. Реализации:

- `MemoryStore` (`src/memory-store.ts`) — in-memory, для тестов и как эталон;
- `DexieStore` (`apps/web/src/dexie-store.ts`) — IndexedDB для веба.

Ключевое: `appendReview` — только добавление; `listReviews` — по возрастанию
времени. При `deleteCard` журнал повторений намеренно **не** удаляется. См.
[ADR-002](docs/adr/ADR-002-review-log-source-of-truth.md).

## 5. CardState

`CardState = 'new' | 'learning' | 'review' | 'relearning'` (`src/types.ts`).

- `new` — создана, ещё не отвечали; due немедленно.
- `learning` — проходит короткие learning-шаги (после Again/Hard/Good на новой).
- `review` — «выпущена», интервалы измеряются днями.
- `relearning` — провалена после review (Again), проходит relearning-шаги.

Состояние фиксируется в каждом `Review` (`stateBefore`/`stateAfter`), поэтому
последовательность состояний воспроизводима из журнала (об ограничениях
полного replay — §9 и `ARCHITECTURE.md` §10).

## 6. Review Log

Append-only журнал ответов — **source of truth**. `SchedulingState` на карте —
производный кэш. Каждый `Review` (`src/types.ts`) содержит: `id`, `cardId`,
`rating`, `reviewedAt`, `stateBefore`, `stateAfter`, `dueAfter`, `stability`,
`difficulty`, `scheduledDays`.

## 7. Жизненный цикл карточки

```
addCard()            → state=new,        due=now              (в очереди сессии сразу)
review(Again)        → state=learning,   due≈+1m              +1 Review в лог
review(Hard/Good)    → state=learning,   due≈+6m / +10m       (проходит шаги)
review(Good) ×N      → state=review,     due=+дни             («выпуск»)
review(Easy) на new  → state=review,     due=+дни             (сразу выпуск)
review(Again) в review → state=relearning, due≈+10m           lapses++, relearning-шаги
updateCardContent()  → контент меняется, due/scheduling НЕ меняются
deleteCard()         → карта удалена, Review Log сохранён
```

Точные интервалы задаёт FSRS; конкретные минуты выше — иллюстративны.

## 8. Поток данных

Запись ответа (UI → ядро):
```
UI (ReviewSession)
  └─ engine.review(cardId, rating)
       ├─ scheduler.applyRating(card, rating, now)   // расчёт нового расписания
       ├─ store.putCard(updatedCard)                 // обновление кэша карты
       └─ store.appendReview(review)                 // append в source of truth
```

Выбор следующей карты (UI → поток сессии → ядро):
```
UI (ReviewSession)
  └─ studySession.nextCard()
       └─ engine.listCards()          // только публичный API
          → политика: due<=now по due; иначе learning/relearning в окне learn-ahead
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
- **Открытый вопрос:** явный replay Review Log → scheduling ещё не реализован
  (`ARCHITECTURE.md` §10) — журнал сегодня восстанавливается пересчётом через
  детерминированный `Scheduler`, отдельной функции `rebuild` и её теста пока нет.

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
