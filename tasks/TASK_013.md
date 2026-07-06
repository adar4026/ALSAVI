# TASK_013 — CLI reads a real ALSAVI backup snapshot (`--db`)

## Цель

Научить CLI отвечать по ЭКСПОРТИРОВАННОМУ СНИМКУ реальной базы карточек
ALSAVI (snapshot на момент выгрузки из web, не live-база), загружая его
из backup-файла через существующий механизм восстановления. Впервые
замкнуть E2E на настоящих данных:

backup.json (снимок) → importBackup → MemoryStore → LearningEngine → AIService → Ollama → ответ
CLI видит состояние базы на момент экспорта; изменения, сделанные в web
после выгрузки, в снимок не попадают. Это осознанная граница первого
сценария.

Без нового Storage, без изменения Engine / AI / web / backup, без нового
API. Используется только уже написанное (`importBackup`/`replaceAll`,
TASK_009).

## Обязательно перечитать

CLAUDE.md, PROJECT_CONSTITUTION.md, ARCHITECTURE.md, ENGINE.md,
PROGRESS.md, ADR-001…004, TASK_009 (backup), TASK_010, TASK_011,
TASK_012.

## Архитектурная основа (из ANALYSIS-отчёта)

- Реальные данные живут в браузерном IndexedDB (`DexieStore`),
  недоступном Node. Мост в Node — ручной экспорт web (`exportBackup`
  → JSON) + загрузка в CLI. Это осознанная граница первого сценария,
  не дефект.
- Механизм приёма готов и публичен:
  `importBackup(store: EngineStore, text): Promise<RestoreReport>`
  → внутри `parseBackup(text)` → `store.replaceAll(...)`.
  CLI его ИСПОЛЬЗУЕТ, не дублирует.
- Живая синхронизация / общий Node-стор — ЯВНО вне рамок (нет триггера;
  оправдается только если ручной экспорт окажется реальным трением на
  практике — наблюдение, не предположение).

## Жёсткие ограничения

- Не менять: Engine, публичный API Engine, AIService, LLMProvider,
  OllamaProvider, MockProvider, Context Budget Guard, `@alsavi/backup`,
  `apps/web`, любой Storage.
- CLI использует только существующий публичный API `@alsavi/ai`,
  `@alsavi/engine`, `@alsavi/backup`. Если чего-то не хватает — STOP,
  вынести вопрос, ничего не менять в этих пакетах.
- Не вводить: новый Storage (file/sqlite/level), HTTP, live-sync,
  Selection, Retrieval, streaming — ничего из этого.
- Чтение файла — встроенный `node:fs` (не новая зависимость).

## Что реализовать

Добавить в CLI (`apps/cli`) опциональный флаг `--db <path>`:

- **Без `--db`** — поведение TASK_012 без изменений: пустой
  `MemoryStore`, ответ по пустому контексту. Обратная совместимость.
- **С `--db <path>`**:
  1. прочитать файл (`fs.readFile`, UTF-8);
  2. `const store = new MemoryStore();`
  3. `await importBackup(store, text);` (существующая функция —
     она сама валидирует через `parseBackup`);
  4. `const engine = new LearningEngine(store);`
  5. далее как в TASK_012: `new AIService({ engine, provider, contextBudgetChars })`.

CLI остаётся composition root — только собирает существующие
компоненты, никакой доменной логики, никакого парсинга backup вручную.

## Ошибки (часть контракта)

- **Файл не найден / нечитаем** (`ENOENT` и т.п.): понятное сообщение
  в stderr, код ≠ 0, `AIService` не конструируется.
- **Backup невалиден**: обработать согласно ФАКТИЧЕСКОМУ контракту
  `importBackup`, установленному в Фазе 1 (throw / `RestoreReport` с
  флагом / поле ошибок — что именно, выясняется до кода). Не дублировать
  валидацию. Результат для пользователя: понятное сообщение в stderr,
  код ≠ 0, engine не строится.
- Обработка — тем же способом, что ошибки аргументов в TASK_012
  (stderr + ненулевой код), без retry и «полезных» автодействий.

## Фаза 1 — Анализ (до кода)

Определить:
- точную сигнатуру и поведение `importBackup` / `RestoreReport` /
  ошибок `parseBackup` — что именно возвращается при невалидном входе
  (бросок или report с флагом/полем ошибок). От этого зависит обработка
  ошибок backup;
- где в существующем `run(argv, io)` встроить загрузку (после разбора
  аргументов, до конструирования engine);
- как тестировать без реального fs и без Ollama.

**Стоп-условие A:** если загрузка требует изменения Engine / AI /
backup / любого пакета кроме `apps/cli` — STOP, вынести вопрос.

**Стоп-условие B:** если остаётся неоднозначность реализации (формат
ошибки `importBackup`, способ мока fs) — сформулировать развилку,
спросить до кода.

## Definition of Done

1. Флаг `--db <path>` добавлен; опционален.
2. Без `--db` — поведение TASK_012 не изменилось (существующие тесты
   CLI зелёные без правок).
3. С `--db` валидным файлом: `importBackup` наполняет `MemoryStore`,
   engine строится над ним, ответ идёт по загруженному снимку базы.
4. Файл не найден/нечитаем → stderr, код ≠ 0, AIService не создан.
5. Невалидный backup → stderr с причиной (по фактическому контракту
   `importBackup`), код ≠ 0, engine не создан.
6. Engine / AI / backup / web / любой Storage не изменены (пустой diff
   в этих пакетах).
7. CLI использует только существующий публичный API (`importBackup`,
   `MemoryStore`, `LearningEngine`, `AIService`) — без новой доменной
   логики.
8. Тесты:
   - `--db` с валидной backup-фикстурой (JSON-строка в тесте, `fs`
     замокан): `importBackup` завершился успешно, `LearningEngine`
     создан над НЕПУСТЫМ `MemoryStore`, `AIService.answer()` выполнился
     без ошибок, провайдер вызван РОВНО один раз. НЕ проверять
     содержимое prompt (это деталь PromptBuilder, не предмет теста);
   - `--db` с несуществующим файлом → код ≠ 0, stderr, provider не вызван;
   - `--db` с невалидным backup → код ≠ 0, stderr, provider не вызван;
   - без `--db` → прежнее поведение TASK_012.
9. Ни один тест не требует реального файла на диске, реальной Ollama;
   `fs` и `fetch` мокируются; CI детерминирован.
10. Все существующие тесты (engine, anki-import, backup, ai, cli)
    зелёные.
11. ARCHITECTURE.md (CLI умеет грузить снимок базы из backup; мост
    web → file → CLI; ответ по снимку, не live) и PROGRESS.md обновлены.
12. Один отдельный коммит `feat(cli): load base snapshot from backup via --db`.
13. Push НЕ выполнять.

## Явно вне рамок TASK_013

Новый Storage (file/sqlite/level), live-синхронизация web↔CLI,
автоэкспорт из браузера, HTTP/mobile, Selection/Retrieval/Search,
streaming, citations, изменение Engine/AI/backup/web, новый публичный
API, tokenizer.

## Отчёт

Изменённые/новые файлы, добавленные тесты, результат полного прогона,
подтверждение неизменности Engine/AI/backup/web, подтверждение
детерминизма (без реального fs и Ollama), hash коммита, подтверждение
что push не выполнялся.
