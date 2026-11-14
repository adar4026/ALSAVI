import { useEffect, useRef } from 'react';
import type { NoteEntry } from './card-list';
import { learningRows } from './cards-view';
import { Icon } from './Icon';
import { Button, GroupedList, ListRow } from './ui';

export interface CardDetailProps {
  entry: NoteEntry;
  now: number;
  /** A screen of its own on a phone (back button, `h1`); a pane beside the list on a computer. */
  standalone: boolean;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  busy: boolean;
}

/**
 * Everything about one word (TASK_041, SCREEN_SPECIFICATIONS §5): the word,
 * its translation, example, personal note and tags, and how its learning
 * goes — all from `NoteEntry` (`engine.listCardViews()`), no extra requests,
 * nothing here changes the schedule. Actions: "Изменить" (the edit sheet),
 * "В архив" / "Вернуть из архива".
 */
export function CardDetail({ entry, now, standalone, onBack, onEdit, onArchive, onUnarchive, busy }: CardDetailProps) {
  const { note } = entry;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const Title = standalone ? 'h1' : 'h2';

  // A phone screen of its own: focus starts at the word (screen readers read
  // it first). Beside the list, focus stays on the row that was chosen.
  useEffect(() => {
    if (standalone) titleRef.current?.focus({ preventScroll: true });
  }, [note.id, standalone]);

  return (
    <article className="card-detail" aria-labelledby={`detail-${note.id}`}>
      <div className="card-detail-bar">
        {standalone ? (
          <button type="button" className="card-detail-back" onClick={onBack}>
            <Icon name="chevron-left" size={22} />
            Карточки
          </button>
        ) : (
          <span />
        )}
        <Button variant="tertiary" icon="edit" onClick={onEdit} aria-label={`Изменить «${note.front}»`}>
          Изменить
        </Button>
      </div>

      <header className="card-detail-head">
        <Title id={`detail-${note.id}`} ref={titleRef} tabIndex={-1} className="card-detail-front" lang="es">
          {note.front}
        </Title>
        <p className="card-detail-translation">{note.back}</p>
      </header>

      {note.example && (
        <section className="card-detail-note" aria-label="Пример">
          <h3 className="card-detail-label">Пример</h3>
          <p lang="es">{note.example}</p>
        </section>
      )}
      {note.memo && (
        <section className="card-detail-note" aria-label="Моя заметка">
          <h3 className="card-detail-label">Моя заметка</h3>
          <p>{note.memo}</p>
        </section>
      )}
      {entry.tags.length > 0 && (
        <ul className="card-detail-tags" aria-label="Теги">
          {entry.tags.map((t) => (
            <li key={t} className="card-detail-tag">
              #{t}
            </li>
          ))}
        </ul>
      )}

      <GroupedList title="Обучение" className="card-detail-learning">
        {learningRows(entry, now).map((row) => (
          <ListRow key={row.label} title={row.label} trailing={<span className="card-detail-value">{row.value}</span>} />
        ))}
      </GroupedList>

      {entry.archived ? (
        <Button variant="secondary" icon="restore" block onClick={onUnarchive} disabled={busy}>
          Вернуть из архива
        </Button>
      ) : (
        <Button variant="destructive" icon="archive" block onClick={onArchive} disabled={busy}>
          В архив
        </Button>
      )}
    </article>
  );
}
