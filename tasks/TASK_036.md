# TASK_036: Библиотека базовых компонентов

**Status: DONE (код + тесты), ветка `docs/ui-ux-design`, без push и деплоя.**
Второй этап UI v2 (`docs/ui-ux/IMPLEMENTATION_ROADMAP.md`). Общие компоненты
в `apps/web/src/ui/` на токенах TASK_035; экраны переведены на `Button`,
`IconButton`, `SegmentedControl`, `ProgressBar`, `Banner`, `Switch` без смены
раскладки; дубли этих примитивов удалены.

## Слой

**Только UI** (`apps/web`). Не менялись: Engine, FSRS, `StudySession`, Review
Log, Dexie, бэкап, `sw.js`, PWA, push, навигация и состав экранов,
контроллеры (`review-flow.ts`, `review-hotkeys.ts`, `practice-flow.ts`,
`note-form.ts`, `archive-flow.ts`, `reminder-*`).

## Противоречие спецификации и решение

Критерий плана «ни одного дублирующего класса из таблицы COMPONENT_LIBRARY»
противоречит другому требованию той же задачи — переводить экраны только на
`Button`, `SegmentedControl`, `ProgressBar`, `Banner` «без смены раскладки».
Панели, чипы, значки, KPI, пустые состояния, поля формы — части раскладки
экранов, их замена — это редизайн экранов (TASK_037–043).

**Решение:** в TASK_036 убраны дубли тех примитивов, на которые переведены
экраны (+ переключатель, который спецификация прямо делает общим); остальные
компоненты созданы и показаны на витрине, а их старые классы уходят в задачах
своих экранов:

| Старые классы | Компонент | Задача |
|---|---|---|
| `.panel`, `.home-card`, `.card-panel`, `.stats-card`, `.welcome-card` | `Surface` | 038–043 |
| `.quick-action` | `Tile` | 039 |
| `.chip`, `.chip-tag`, `.chip-add` | `Chip`, `ChipRow` | 040–041 |
| `.state-badge`, `.status`, `.count-badge`, `.practice-badge` | `Badge` | 038, 041, 042 |
| `.kpi`, `.digest-item`, `.queue-count` | `Stat`, `StatGroup` | 039, 042 |
| `.empty-state`, `.list-empty`, `.activity-empty` | `EmptyState` | 039–042 |
| `.field input/textarea`, `.search-input`, `.limit-input` | `TextField`, `TextArea`, `SearchField`, `Stepper` | 040, 041, 043 |
| inline `.confirm` (архив) | `Dialog` | 041 |
| `.answer-buttons` | `RatingBar` (новый) | 038 |
| `WeekChart`, `ActivityChart` | `BarChart` | 039, 042 |

`RatingBar`, `BarChart`, `ActionDock`, `SessionHeader`, `ScreenHeader`,
`HomeHeader` из COMPONENT_LIBRARY в список TASK_036 плана не входят — они
создаются в задачах своих экранов (037–039).

## Что сделано

### Компоненты (`apps/web/src/ui/`)

| Файл | Компоненты | Заменили / заменят |
|---|---|---|
| `Button.tsx` | `Button` — `primary · secondary · tertiary · destructive · danger`, `md` 44 / `lg` 52, иконка до/после, `loading`, `block` | `.btn-primary/-secondary/-link/-danger/-quiet-danger/-cta` |
| `IconButton.tsx` | `IconButton` — `plain · filled · accent`, 44 × 44, обязательная подпись | `.icon-button`, `.btn-icon` |
| `Surface.tsx` | `Surface` — `hero · card · inset`, заголовок + действие | панели (позже) |
| `Tile.tsx` | `Tile` — быстрое действие, тон `warm` | `.quick-action` (039) |
| `ListRow.tsx` | `ListRow` (кнопка-строка или статичная), `GroupedList` | список, Профиль (041, 043) |
| `TextField.tsx` | `TextField`, `TextArea`, `SearchField` | поля (040–043) |
| `Switch.tsx` | `Switch` — общий iOS-переключатель | `.switch` (TASK_034) |
| `Stepper.tsx` + `stepper-math.ts` | `Stepper` − значение + | поле лимита (043) |
| `SegmentedControl.tsx` | `SegmentedControl` на нативных радиокнопках | `.segmented`, `.period-toggle` |
| `Chip.tsx` | `Chip` (`filter · tag · suggestion`), `ChipRow` (одна строка, прокрутка) | чипы (040–041) |
| `Badge.tsx` | `Badge` (5 тонов, счётчик) | значки (038–042) |
| `Progress.tsx` | `ProgressBar` (`sm` 4 / `md` 8, `accent · success`), `ProgressRing` | `.progress-bar`, `.goal-bar` |
| `Stat.tsx` | `Stat`, `StatGroup` | KPI (039, 042) |
| `Banner.tsx` | `Banner` — `info · warning · error · success`, иконка, до 2 действий | `.notice*`, `.save-error`, `.update-banner` |
| `toast-queue.ts`, `Toast.tsx` | `ToastQueue` (+ общий `toasts`), `ToastHost` | — (подключение в оболочку — с первым экраном, где нужен тост) |
| `sheet-state.ts`, `Sheet.tsx` | `SheetController`, `Sheet`, `Dialog` на нативном `<dialog>` | лист формы (040), подтверждения (041) |
| `States.tsx` | `EmptyState`, `Skeleton` (`home · list · stats · session`, задержка 150 мс) | пустые состояния, загрузка |
| `ui.css` | стили всех компонентов, только токены | — |
| `Showcase.tsx`, `showcase.css` | витрина `#/ui`, **только dev** | — |

`Icon.tsx`: +17 иконок (`close, search, sort, tag, chevron-down, check,
archive, restore, edit, bell, palette, download, upload, info, refresh, book,
minus`) в прежнем стиле.

### Перевод экранов (раскладка та же)

| Экран | Что переведено |
|---|---|
| Оболочка (`App`) | баннер «Доступна новая версия» → `Banner`; «Повторить» при ошибке настроек → `Button` |
| Шапка | «Настройки» → `IconButton filled` |
| Главная | ошибка → `Banner`; «Добавить первую карточку», «Продолжить обучение» → `Button lg block`; «Вся статистика» → `tertiary`; полоса цели → `ProgressBar` (`success` при пройденной очереди); «Проверить снова» → `secondary` |
| Сессия | прогресс → `ProgressBar sm`; «Завершить» → `tertiary`; «Показать ответ», «На главный» → `Button`; ошибка сохранения → `Banner error` |
| Тренировка | прогресс, «Завершить», «Показать ответ», действия ошибки/пусто/итога → компоненты |
| Карточки | «Повторить трудные слова» → `Button` с иконкой; уведомление архива → `Banner info` + `IconButton close`; ошибки → `Banner`; «Изменить», «В архив», «Вернуть», «Сбросить фильтры» → `secondary`; подтверждение архива → `danger` + `secondary` |
| Форма | «+ Пример и личная заметка» → `tertiary`; дубль → `Banner warning` с тремя действиями; ошибка → `Banner`; «Добавить» / «Сохранить» / «Отмена» → `Button` |
| Статистика | ошибка → `Banner`; 7 / 30 дней → `SegmentedControl`; «Добавить слово», «Перейти к обучению», «Посмотреть слова» → `Button` |
| Профиль | тема → `SegmentedControl`; импорт/экспорт/восстановление → `secondary`; напоминания: переключатели → `Switch`, запрет → `Banner warning`, проверка → `secondary` |

`styles.css`: правила старых примитивов удалены **парсером CSS** с
проверкой полного совпадения при разборе-сборке (−405 строк); контекстные
правила переведены на новые классы и сокращены до раскладки
(`.row-actions .ui-button`, `.data-actions .ui-button`, `.goal-recheck`,
`.goal-progress`, `.session-progress-bar`, `.session-error`, `.archive-undo`,
`.app-update`, `.home-cta`, `.stats-empty-cta`, `.form-more`).
`main.tsx` подключает `styles.css`, затем `ui/ui.css`, затем приложение —
порядок каскада зафиксирован тестом.

### Видимые изменения (утверждённый вид DESIGN_SYSTEM)

- Вторичные кнопки — мягкая фиолетовая заливка (были белые с рамкой); «В архив» в строке тоже `secondary` (до TASK_041, где действия уходят из строк — не красная, чтобы список не пестрел).
- Основные кнопки: отступ 16 вместо 28; главная кнопка Главной — 52 px, радиус 14, без свечения (была 56, радиус 16, свечение).
- Ссылки (`tertiary`) — 15 px вместо 14.
- Баннеры — без рамки, с иконкой тона, 15/20 вместо 14.
- Сегменты — выбранный пункт цветом текста и тенью `--elev-1` (был акцентный текст и `--elev-2`).
- Прогресс сессии — 4 px без рамки (было 6 px с рамкой); полоса цели — 8 px, ровный акцент (была 10 px с градиентом).

### Важные детали поведения

- **Escape в `<dialog>`.** Chrome разрешает странице отменить Escape только после пользовательского действия; иначе окно закрывается само. `useModal` (`Sheet.tsx`) ловит такой `close`, сообщает об Escape ровно один раз и снова показывает окно, если вызывающий его не закрыл (лист под вопросом «Отменить изменения?»). Найдено и исправлено при ручной проверке.
- **Возврат фокуса** откладывается на одну задачу и пропускает элементы внутри закрытых окон — при одновременном закрытии листа и подтверждения фокус возвращается на кнопку, открывшую лист.
- **Горячие клавиши сессии** (TASK_025): `Button` — нативный `<button type="button">`, поэтому `focusKind` видит `control`, Enter/Space на кнопке в фокусе срабатывают нативно.

## Критерии приёмки

- [x] Компоненты из списка плана созданы в `src/ui/` (+ `toast-queue.ts`), иконки дополнены.
- [x] Экраны переведены на `Button`, `SegmentedControl`, `ProgressBar`, `Banner` (+ `IconButton`, `Switch`) без смены раскладки.
- [x] Нет дублирующих классов для этих примитивов — тест `ui-kit.test.ts` (25 классов: ни в `className`, ни в `styles.css`). Остальные дубли — по таблице выше (решение противоречия).
- [x] Все состояния D/H/P/F/X/L/E — на витрине `#/ui` (только dev; в сборке нет — проверено по `dist`).
- [x] `Sheet`/`Dialog` на нативном `<dialog>`: фокус-ловушка, Escape, возврат фокуса — проверено настоящими нажатиями.
- [x] Риск клавиатуры сессии проверен: `review-hotkeys.test.ts` зелёный + ручная проверка.

## Тесты

+49 тестов (web 258 → 307):
- `toast-queue.test.ts` (8): одна очередь по порядку; 4 / 6 с; пауза с сохранением остатка; идемпотентность; действие; снятие ожидающего; ограничение очереди; подписка и очистка.
- `sheet-state.test.ts` (8): открыть/закрыть; без несохранённого закрывается всегда; с несохранённым — вопрос, «Отменить» / «Продолжить»; «done» не спрашивает; лист с черновиком не спрашивает; состояние читается в момент закрытия.
- `ui-kit.test.ts` (33): арифметика степпера; `ui.css` — без литеральных цветов, все `var()` из `styles.css`, своих токенов нет, переходы на `--dur-*`, порядок подключения; 25 старых классов не используются и не стилизуются.

`npm test` — **598 passed + 1 skipped** (было 549 + 1). `tsc --noEmit` чист во
всех 8 пакетах; `npm run build` без предупреждений (JS 481.6 kB — как раньше,
CSS 55.6 kB: +13 kB стилей компонентов, часть из них используется со
следующих задач); `git diff --check` чист.

## Проверки в браузере

Dev, изолированный профиль; данные — через публичный API ядра (23 слова,
история за 16 дней), после проверки IndexedDB / `localStorage` /
`sessionStorage` удалены (`[]`, 0, 0).

- Витрина `#/ui`: все компоненты в светлой и тёмной теме (390 px).
- Лист: открыт настоящим нажатием; Escape при несохранённом → лист остаётся, сверху «Отменить изменения?», фокус на «Продолжить»; Escape → назад в лист; Tab ×7 не выходит из листа; «Отмена» → «Отменить» → оба окна закрыты, фокус на «Открыть лист».
- Тост с действием: показ, «Вернуть» выполняет действие и показывает следующий.
- Экраны (Главная, Карточки «Трудные», Статистика, Профиль, Сессия) — светлая/тёмная; 375 / 390 / 430 / 1280 px: горизонтальной прокрутки нет, целей касания < 44 px нет.
- Сессия: Пробел — показать ответ; «3» — один ответ (1 → 2 из 10); Enter на «Показать ответ» в фокусе — только показ ответа; Space на «Завершить» в фокусе — выход. Консоль без ошибок.

**На iPhone не проверялось** (только эмуляция ширин).

## Изменённые файлы

- Новые: `apps/web/src/ui/*` (25 файлов), `apps/web/test/toast-queue.test.ts`, `sheet-state.test.ts`, `ui-kit.test.ts`, `tasks/TASK_036.md`.
- Изменённые: `App.tsx`, `AppHeader.tsx`, `CardManager.tsx`, `HomeScreen.tsx`, `Icon.tsx`, `NoteForm.tsx`, `PracticeSession.tsx`, `ProfileScreen.tsx`, `RemindersSection.tsx`, `ReviewSession.tsx`, `StatsScreen.tsx`, `main.tsx`, `styles.css`; `docs/ui-ux/COMPONENT_LIBRARY.md` (§10 уточнения); `PROGRESS.md`.

## Ограничения

- `ToastHost` пока не подключён в оболочку: ни один экран ещё не показывает тосты (уведомление архива остаётся баннером до TASK_041).
- Подпись темы «Как в системе» по-прежнему переносится на 375–390 px (сокращение до «Система» — TASK_043).
- Неиспользуемые пока компоненты (`Surface`, `Tile`, `ListRow`, поля, `Chip`, `Badge`, `Stat`, `Sheet`, `Dialog`, `EmptyState`, `Skeleton`, `Stepper`, `ProgressRing`) проверены только на витрине.
- Escape-поведение `<dialog>` проверено в Chromium; Safari iOS — в TASK_044.
