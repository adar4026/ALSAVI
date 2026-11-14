import { useState, type Dispatch, type SetStateAction } from 'react';
import { EMPTY_FILTER, LIST_PAGE, SORT_ORDERS, type ListFilter, type NoteEntry, type SortOrder, type StatusFilter } from './card-list';
import { rowStatus } from './cards-view';
import { CARD_FORMS, WORD_FORMS } from './home-view';
import { Icon } from './Icon';
import { countLabel } from './stats-view';
import { Badge, Banner, Button, Chip, ChipRow, EmptyState, ListRow, SearchField, Sheet, Skeleton } from './ui';

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'Все'],
  ['due', 'К повторению'],
  ['new', 'Новые'],
  ['learning', 'Изучаются'],
  ['difficult', 'Трудные'],
  ['archived', 'Архив'],
];

export interface CardListProps {
  /** Every note (active and archived) — for the empty states and counts. */
  entries: readonly NoteEntry[];
  /** The filtered, sorted rows. */
  visible: readonly NoteEntry[];
  /** How many of them are rendered ("Показать ещё" adds a page). */
  limit: number;
  onShowMore: () => void;
  activeCount: number;
  filter: ListFilter;
  setFilter: Dispatch<SetStateAction<ListFilter>>;
  sort: SortOrder;
  setSort: (order: SortOrder) => void;
  counts: Record<StatusFilter, number>;
  /** Tags of the current scope (active or archive) with note counts. */
  filterTags: ReadonlyArray<{ tag: string; count: number }>;
  now: number;
  loaded: boolean;
  loadError: string | null;
  onRetry: () => void;
  onAdd: () => void;
  onOpen: (noteId: string) => void;
  /** The word shown beside the list (computer layout). */
  selectedId: string | null;
  practiceCount: number;
  onPractice?: () => void;
}

/**
 * The "Карточки" list (TASK_041, SCREEN_SPECIFICATIONS §3): search, state
 * chips with counts, the "Теги" sheet and the order above 64 px rows. A row
 * is one button — everything about the word is in the card view.
 */
export function CardList({
  entries,
  visible,
  limit,
  onShowMore,
  activeCount,
  filter,
  setFilter,
  sort,
  setSort,
  counts,
  filterTags,
  now,
  loaded,
  loadError,
  onRetry,
  onAdd,
  onOpen,
  selectedId,
  practiceCount,
  onPractice,
}: CardListProps) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const showingArchive = filter.status === 'archived';
  const filtersActive = filter.query.trim() !== '' || filter.tags.length > 0 || filter.status !== 'all';

  function setStatus(status: StatusFilter) {
    // Tags of the archive and of the active list differ — reset them only across that switch.
    setFilter((f) => ({ ...f, status, tags: (status === 'archived') === showingArchive ? f.tags : [] }));
  }

  function toggleTag(tag: string) {
    setFilter((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));
  }

  if (loadError) {
    return (
      <Banner
        tone="error"
        actions={
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        }
      >
        {loadError}
      </Banner>
    );
  }
  if (!loaded) return <Skeleton variant="list" label="Загрузка карточек" />;
  if (entries.length === 0) {
    return (
      <EmptyState
        brand
        icon="cards"
        title="Здесь будут твои слова"
        text="Добавь первое — оно сразу появится в очереди на Главной."
        action={
          <Button icon="plus" onClick={onAdd}>
            Добавить слово
          </Button>
        }
      />
    );
  }

  const query = filter.query.trim();
  const tagLabel = filter.tags.length > 0 ? `Теги · ${filter.tags.length}` : 'Теги';

  return (
    <div className="cards-list">
      <div className="cards-tools">
        <SearchField
          value={filter.query}
          onChange={(query) => setFilter((f) => ({ ...f, query }))}
          label="Поиск карточек"
          placeholder="Поиск: слово, перевод, пример…"
        />
        <ChipRow label="Состояние" className="cards-states">
          {STATUS_FILTERS.map(([value, label]) => (
            <Chip key={value} pressed={filter.status === value} count={counts[value]} onClick={() => setStatus(value)}>
              {label}
            </Chip>
          ))}
        </ChipRow>
        <div className="cards-tools-row">
          <button
            type="button"
            className="cards-tool"
            aria-haspopup="dialog"
            aria-pressed={filter.tags.length > 0}
            onClick={() => setTagsOpen(true)}
            disabled={filterTags.length === 0}
          >
            <Icon name="tag" size={18} />
            {tagLabel}
            <Icon name="chevron-down" size={16} />
          </button>
          <label className="cards-tool cards-sort">
            <Icon name="sort" size={18} />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)} aria-label="Порядок">
              {SORT_ORDERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={16} />
          </label>
          <span className="cards-found" aria-live="polite">
            <span className="sr-only">{showingArchive ? 'В архиве: ' : 'Найдено: '}</span>
            {filtersActive && !showingArchive ? `${visible.length} из ${activeCount}` : countLabel(visible.length, WORD_FORMS)}
          </span>
        </div>
      </div>

      {filter.status === 'difficult' && onPractice && practiceCount > 0 && (
        <Banner
          tone="info"
          className="cards-practice"
          actions={
            <Button icon="play" onClick={onPractice} aria-label={`Начать тренировку: ${countLabel(practiceCount, CARD_FORMS)}`}>
              Начать
            </Button>
          }
        >
          Тренировка · {countLabel(practiceCount, CARD_FORMS)} — расписание не меняется
        </Banner>
      )}

      {visible.length === 0 ? (
        showingArchive && !query && filter.tags.length === 0 ? (
          <EmptyState icon="archive" title="В архиве пусто" text="Сюда попадают слова, убранные из повторений." />
        ) : (
          <EmptyState
            icon="search"
            title={query ? `Ничего не найдено по «${query}»` : 'Нет слов с такими фильтрами'}
            action={
              <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                Сбросить фильтры
              </Button>
            }
          />
        )
      ) : (
        <ul className="cards-rows" aria-label="Слова">
          {visible.slice(0, limit).map((entry) => {
            const status = rowStatus(entry, now);
            const reverse = entry.cards.length > 1;
            return (
              <li key={entry.note.id} id={`note-${entry.note.id}`}>
                <ListRow
                  title={entry.note.front}
                  lang="es"
                  subtitle={entry.note.back}
                  selected={selectedId === entry.note.id}
                  onClick={() => onOpen(entry.note.id)}
                  trailing={
                    <span className="cards-row-end">
                      {status.tone ? <Badge tone={status.tone}>{status.text}</Badge> : <span className="cards-row-when">{status.text}</span>}
                      {reverse && (
                        <span className="cards-row-reverse">
                          <Icon name="swap" size={16} />
                          <span className="sr-only">, с обратной карточкой</span>
                        </span>
                      )}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > limit && (
        <Button variant="secondary" block className="cards-more" onClick={onShowMore}>
          Показать ещё {Math.min(LIST_PAGE, visible.length - limit)}
        </Button>
      )}

      <Sheet
        open={tagsOpen}
        title="Теги"
        onRequestClose={() => setTagsOpen(false)}
        leading={
          filter.tags.length > 0 && (
            <Button variant="tertiary" onClick={() => setFilter((f) => ({ ...f, tags: [] }))}>
              Сбросить
            </Button>
          )
        }
        trailing={
          <Button variant="tertiary" onClick={() => setTagsOpen(false)}>
            Готово
          </Button>
        }
      >
        <p className="cards-tags-hint">Показать слова со всеми выбранными тегами.</p>
        <div className="cards-tags" role="group" aria-label="Теги">
          {filterTags.map(({ tag, count }) => (
            <Chip
              key={tag}
              variant="tag"
              pressed={filter.tags.includes(tag)}
              count={count}
              onClick={() => toggleTag(tag)}
              aria-label={`#${tag}, слов: ${count}`}
            >
              #{tag}
            </Chip>
          ))}
        </div>
        <p className="cards-tags-found" aria-live="polite">
          {showingArchive ? 'В архиве' : 'Найдено'}: {countLabel(visible.length, WORD_FORMS)}
        </p>
      </Sheet>
    </div>
  );
}
