# Библиотека UI-компонентов

Компоненты — React без UI-библиотек, стили на токенах
([DESIGN_SYSTEM](DESIGN_SYSTEM.md)). Предлагаемое место: `apps/web/src/ui/`
(по файлу на компонент) + `apps/web/src/ui/ui.css` (или раздел в
`styles.css` — решение реализации; Vite импортирует CSS без зависимостей).
Логика состояний, где она есть, — в чистых модулях с тестами (паттерн проекта:
`*-view.ts`, `*-flow.ts`; React Testing Library в проекте нет и не вводится).

**Принцип — не дублировать:** каждый компонент ниже заменяет перечисленные
существующие классы; новых параллельных вариантов не создаётся.

Обозначения состояний: **D** default · **H** hover · **P** pressed ·
**F** focus-visible · **S** selected · **X** disabled · **L** loading ·
**E** error.

---

## 1. Кнопки

### Button
Заменяет: `.btn-primary`, `.btn-secondary`, `.btn-link`, `.btn-danger`,
`.btn-quiet-danger`, `.btn-cta`.

| Проп | Значения |
|---|---|
| `variant` | `primary` · `secondary` · `tertiary` · `destructive` |
| `size` | `md` (44) · `lg` (52) |
| `icon`, `iconEnd` | `IconName` |
| `loading`, `disabled`, `block` (на всю ширину) | boolean |

| | primary | secondary | tertiary | destructive |
|---|---|---|---|---|
| D | `--accent` / `--on-accent` | `--accent-soft` / `--accent-text` | прозрачный / `--accent-text` | `--danger-soft` / `--danger-text` (в диалоге — `--danger-fill` / белый, см. DESIGN_SYSTEM §10) |
| H | `--accent-strong` | soft +4 % | подчёркивание | soft +4 % |
| P | scale .97, `--accent-strong` | scale .97 | opacity .6 | scale .97 |
| F | `--focus-ring` | то же | то же | то же |
| X | opacity .4, без hover | то же | то же | то же |
| L | спиннер 18 px вместо иконки, текст сохраняется, `aria-busy` | то же | — | то же |

Размеры: `md` — высота 44, отступ 0 16, текст 15/600; `lg` — 52, 0 20, 17/600;
радиус 12 / 14; иконка 20, промежуток 8. Правило: **одна primary на экран**
(в листе — одна в доке).

### IconButton
Заменяет: `.icon-button`, `.btn-icon`. Зона 44 × 44, иконка 22–24, круг
(`--radius-pill`) или квадрат 12. Варианты `plain` (прозрачный) и `filled`
(`--surface` + `--elev-1`). Обязателен `aria-label`.

### RatingButton / RatingBar
Заменяет: `.answer-buttons button`, `.practice-grade`. Один компонент для
сессии и тренировки.

| Проп | Значения |
|---|---|
| `grades` | `again · hard · good` — одинаково в сессии и тренировке (D-06; `easy` в UI не используется) |
| `intervals?` | подписи из `formatInterval` (только сессия) |
| `disabled` | на время `saving` |
| `onGrade(grade)` | — |

Кнопка: высота 64, радиус 14, фон `--{tone}-soft`, подпись 15/600
`--{tone}-text`, интервал 12/500 `--text-secondary`. Тон: again → danger,
hard → warning, good → success. P: фон `--{tone}` 22 %, scale .96, 100 мс.
Три колонки: при 320 px ≈ 93 px, при 375 — 111 px; подписи всегда в одну
строку. `aria-label`: «Не помню. Следующий показ: 10 мин» (как сейчас).
Подсказка клавиш «1 · 2 · 3» — только при `pointer: fine`.

---

## 2. Поверхности

### Surface
Заменяет: `.panel`, `.home-card`, `.card-panel`, `.stats-card`,
`.welcome-card`. `variant`: `hero` (радиус 22, `--elev-2`, отступ 24) ·
`card` (16, граница, `--elev-1`, отступ 20) · `inset` (`--surface-2`, без
тени, радиус 12, отступ 16). Необязательная шапка: `title`, `action`
(tertiary-кнопка справа).

### Tile (быстрое действие)
Заменяет: `.quick-action`. Квадрат-кнопка: иконка в круге 40 (`--accent-soft`),
заголовок 15/600, подпись 13 `--text-secondary`. Мин. высота 96. Состояния
кнопки + `X` для «нет трудных слов».

### ListRow
Новый (основа списка карточек и строк настроек). Высота 64 (72 с тегами),
отступ 0 16. Слоты: `leading` (иконка/точка статуса), `title` (17/600, одна
строка), `subtitle` (15, одна строка, ellipsis), `trailing` (значок, значение,
шеврон, переключатель). Разделитель-вставка слева 16. Состояния: D, P (фон
`--surface-3`), F, S (для мастер-детали ≥ 900: `--accent-soft`).

### GroupedList
Обёртка `ListRow` в `Surface card` без внутренних отступов; заголовок группы
(`overline`) и подпись под группой (`footnote`). Используется в Профиле,
просмотре карточки, листах фильтров.

---

## 3. Ввод

### TextField / TextArea
Заменяет: `.field input`, `.field textarea`, `.search-input`, `.limit-input`.
Метка 13/600 над полем; поле 48 (textarea от 72, авто-рост до 160), радиус 12,
фон `--surface-2`, текст 17. F: фон `--surface`, кольцо 2 px акцентом. E:
кольцо `--danger`, сообщение 13 `--danger-text` под полем, `aria-invalid`,
`aria-describedby`. X: opacity .5. Подсказка (необязательно) — 13
`--text-secondary`. Для испанского — `lang="es"`, `autocapitalize="none"`,
`autocorrect="off"`, `spellcheck=false` (как сейчас).

### SearchField
TextField с иконкой `search` слева, кнопкой очистки справа (44 × 44, видна при
непустом значении), `type="search"`, `enterkeyhint="search"`. Высота 44,
радиус 12. Липкий под заголовком «Карточек».

### Switch
Существующий iOS-переключатель (`.switch` на нативном checkbox, TASK_034) —
**становится общим**. 51 × 31, зона касания — вся строка `ListRow`.
Заменяет чекбокс «обратная карточка».

### Stepper (новый, для лимита новых)
`−` число `+` (кнопки 44 × 44) + переключатель «Без ограничения». Значение
валидируется тем же `assertValidNewCardsPerDay`. Сохранение — как сейчас
(после успешной записи), индикатор «Сохранено» 1.5 с.

### TimeField
Нативный `<input type="time">` в стиле TextField (как сейчас).

### TagInput
Поле + лента подсказок (горизонтальная прокрутка, чипы `suggestion`) +
выбранные теги чипами с «×». Разбор — `parseTagInput` (без изменений).

---

## 4. Выбор и фильтры

### SegmentedControl
Заменяет: `.segmented` (тема), `.period-toggle` (7/30 дней). Радиогруппа на
нативных `<input type="radio">` (как сейчас). Высота 36 (в формах 44 при
`pointer: coarse`), трек `--surface-2`, выбранный — `--surface-raised` +
`--elev-1`. Подписи короткие, без переноса.

### Chip
Заменяет: `.chip`, `.chip-tag`, `.chip-add`. `variant`: `filter`
(`aria-pressed`, S = акцент-заливка) · `tag` (`#тег` + счётчик) · `suggestion`
(«+ тег»). Высота 32 (визуально) / 44 зона касания на сенсорных. Ряд чипов
**не переносится** — горизонтальная прокрутка с затуханием по краям
(`mask-image`), `scroll-snap`.

### Tabs (навигация разделов)
Заменяет: `MainNav` (компонент остаётся, меняется оформление). Телефон:
капсула 64 + safe-area, 4 пункта (иконка 24 + подпись 11/600), S — фон
`--accent-soft` + `--accent-text`, `aria-current="page"`. ≥ 900: вертикальный
список в боковой колонке, пункт 44, иконка 20 + подпись 15/600.

---

## 5. Слои поверх

### Sheet (лист)
Новый. На нативном `<dialog>` (`showModal()` — фокус-ловушка, Escape, фон
средствами браузера — как бывший `SettingsSheet` TASK_029). Телефон: снизу,
верхние углы 22, «ручка» 36 × 5, заголовок 17/600 по центру, слева «Отмена»,
справа необязательная «Готово»; высота по содержимому до `100dvh − 24`.
≥ 900: центрированное окно 560 px или правая панель мастер-детали. Док
действий внизу листа учитывает клавиатуру (`visualViewport.height`).
Закрытие с несохранённым → Dialog «Отменить изменения?».

### Dialog
Заменяет: inline `alertdialog` архива, `window.confirm` (подтверждение ухода и
восстановления — **остаются системными** там, где это `beforeunload`/выбор
файла; внутренние подтверждения переводятся на Dialog). 320 px, радиус 22,
заголовок 17/600, текст 15, 2 кнопки в ряд (destructive справа). Фокус по
умолчанию — на безопасном действии («Отмена»), как сейчас.

### Toast
Заменяет: уведомление «убрана в архив · Вернуть», статусы импорта/экспорта/
сохранения. Снизу над навигацией/доком, радиус 16, `--text` фон с `--bg`
текстом (инверсия), 1–2 строки + одно действие. 4 с (с действием — 6 с),
пауза при фокусе/наведении, `role="status"` (ошибки — Banner, не Toast).
Одновременно — один.

### Banner
Заменяет: `.notice-info`, `.notice-warning`, `.notice-error`, `.save-error`,
`.update-banner`. В потоке, радиус 12, иконка + текст + до 2 действий. Тона:
info / warning / error / success. Ошибки — `role="alert"`.

---

## 6. Данные

### ProgressBar
Заменяет: `.progress-bar`, `.goal-bar`. Высота 4 (сессия) / 8 (цель), трек
`--surface-2`, заливка `--accent`, радиус pill, анимация ширины 240 мс,
`role="progressbar"` с `aria-valuenow/min/max/valuetext`.

### ProgressRing (новый)
SVG-кольцо 56 / 96 px, линия 8, для «Изучено N из M» в Статистике и
«пройдено» в итоге. Число в центре — `--type-kpi`. Без анимации при
reduced-motion.

### Stat / StatGroup
Заменяет: `.kpi`, `.digest-item`, `.queue-count`. Подпись (13/500
`--text-secondary`) + значение (`--type-kpi`) + единица (15) + деталь (13).
`StatGroup` — сетка 2 × 2 (телефон) / 4 × 1 (≥ 600). Семантика `<dl>` как
сейчас.

### BarChart
Заменяет: `WeekChart`, `ActivityChart` (`ActivityCharts.tsx` — оставить файл,
свести к одному компоненту с пропом `density`: `week` (7, подписи дней и
чисел) / `month` (30, ось через 5 дней) / `mini` (7, без чисел, 48 px — для
Главной)). Столбик: радиус 6 сверху, цвет `--accent` (сегодня — `--accent`
+ подпись дня акцентом; будущие/нулевые — трек `--surface-2`). Высота 160 /
48. Доступность: `role="img"` + `aria-label` со сводкой + таблица «По дням» в
`<details>` (как сейчас).

### StageBar
Существующая полоса стадий + легенда — без изменений, только токены.

### Badge
Заменяет: `.state-badge`, `.status`, `.count-badge`, `.practice-badge`. Пилюля
20 px, текст 12/600. Тона: neutral, accent, success, warning, danger.
`count`-вариант — круг 24 px с числом.

### StreakChip
Существующий `.streak-chip` — без изменений по смыслу (иконка пламени +
число, приглушён до первого ответа дня, скрыт при 0).

---

## 7. Состояния экранов

### EmptyState
Заменяет: `.empty-state`, `.list-empty`, `.welcome-card`, `.activity-empty`.
Иконка 48 в круге `--accent-soft` (или бренд-знак для пустой коллекции) +
заголовок 17/600 + 1 строка 15 + одно действие (Button primary/secondary).
Центрирован в доступной высоте.

### Skeleton
Новый. Блоки формы будущего содержимого, фон `--surface-2`, мерцание
opacity .6↔1 1.2 с (выкл. при reduced-motion). Показ с задержкой 150 мс
(быстрые загрузки не мигают). Варианты: `home`, `list` (5 строк), `stats`
(KPI + график), `session` (слово + док).

### ErrorState
`Banner error` + «Повторить» (существующий паттерн, единый вид). Для
полноэкранной ошибки (гейт `bootstrap`) — EmptyState с иконкой `info` и
primary «Повторить».

---

## 8. Шаблоны экранов

| Шаблон | Состав |
|---|---|
| `ScreenHeader` | Крупный заголовок (`title-1`) + необязательный подзаголовок + действия справа (IconButton). При прокрутке > 32 px — компактная липкая строка 44 px с размытым фоном |
| `HomeHeader` | Логотип 32 + «ALSAVI» (headline) + StreakChip |
| `SessionHeader` | IconButton «×» · ProgressBar 4 px · счётчик «3 / 12» (caption, tabular) · необязательная метка «Тренировка» |
| `ActionDock` | Фиксирован внизу, фон `--bg` с верхним затуханием 16 px, отступ 16 + safe-area; содержит Button lg или RatingBar |
| `SplitView` (≥ 900) | Список 380 px + деталь (остаток), разделитель 1 px |

---

## 9. Иконки (`Icon.tsx`)

Существующие: `flame`, `sliders`, `cards`, `target`, `plus`, `arrow-right`,
`chevron-right`, `home`, `chart`, `user`, `play`. Добавить (тот же стиль,
24 × 24, stroke 1.75): `close`, `search`, `sort`, `tag`, `chevron-down`,
`check`, `archive`, `restore`, `edit`, `bell`, `palette`, `download`,
`upload`, `info`, `refresh`, `book`, `speaker` (TASK_045). `sliders`
убирается вместе с кнопкой в шапке.
