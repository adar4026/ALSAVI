import type { CardView } from '@alsavi/engine';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  handlePracticeKeydown,
  PRACTICE_GRADE_LABELS,
  PRACTICE_GRADES,
  PracticeController,
} from './practice-flow';
import { countLabel, TIME_FORMS } from './stats-view';

interface Props {
  /** Loads the cards to practise (`loadDifficultPractice`) — the screen's only data access. */
  loadCards: () => Promise<CardView[]>;
  /** Back to "Карточки" → "Трудные". Leaving records nothing — there is nothing to record. */
  onExit: () => void;
}

/**
 * Difficult-words practice (TASK_032): the study-session layout (card → «Показать
 * ответ» → answer, example and memo → grade), without intervals and without
 * saving anything. A focus mode like the session: `App` hides the navigation.
 * All logic lives in `PracticeController` (`practice-flow.ts`).
 */
export function PracticeSession({ loadCards, onExit }: Props) {
  const controller = useMemo(() => new PracticeController(loadCards), [loadCards]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    void controller.start();
  }, [controller]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handlePracticeKeydown(e, controller);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  if (state.status === 'loading') return <div className="card-panel" aria-busy="true" />;

  if (state.status === 'error' || state.status === 'empty') {
    return (
      <div className="card-panel practice-message">
        <p className="empty-state">
          {state.status === 'error' ? state.error : 'Трудных слов нет: повторять в тренировке пока нечего.'}
        </p>
        <div className="practice-actions">
          {state.status === 'error' && (
            <button type="button" className="btn-primary" onClick={() => void controller.start()}>
              Повторить попытку
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onExit}>
            К трудным словам
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'finished') {
    const s = state.summary!;
    return (
      <section className="home-card practice-summary" aria-labelledby="practice-done-title">
        <span className="eyebrow">Тренировка трудных слов</span>
        <h2 id="practice-done-title" className="home-card-title">
          Тренировка завершена
        </h2>
        <dl className="digest practice-digest">
          <div className="digest-item">
            <dt>Повторено</dt>
            <dd>{s.practised}</dd>
          </div>
          <div className="digest-item">
            <dt>Помню</dt>
            <dd>{s.good}</dd>
          </div>
          <div className="digest-item">
            <dt>Затруднения</dt>
            <dd>{s.struggled}</dd>
          </div>
        </dl>
        {s.struggled > 0 && (
          <>
            <p className="hint">
              «Не помню» — {s.forgot}, «С трудом» — {s.hard}. Эти слова стоит повторить ещё раз:
            </p>
            <ul className="difficult-list">
              {s.struggledCards.map((v) => (
                <li key={v.card.id} className="difficult-item">
                  <span className="difficult-word">
                    <span className="front">{v.front}</span>
                    <span className="back">{v.back}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {state.progress.done < state.progress.total && (
          <p className="hint">
            Завершено досрочно: пройдено {state.progress.done} из {state.progress.total}.
          </p>
        )}
        <p className="hint">Тренировка не меняет расписание повторений и не попадает в статистику.</p>
        <div className="practice-actions">
          {s.struggled > 0 && (
            <button type="button" className="btn-primary" onClick={() => void controller.retryStruggled()} autoFocus>
              Повторить слова с ошибками
            </button>
          )}
          <button
            type="button"
            className={s.struggled > 0 ? 'btn-secondary' : 'btn-primary'}
            onClick={() => void controller.start()}
            autoFocus={s.struggled === 0}
          >
            Повторить ещё раз
          </button>
          <button type="button" className="btn-secondary" onClick={onExit}>
            К трудным словам
          </button>
        </div>
      </section>
    );
  }

  // 'active' — a card is on screen.
  const current = state.current!;
  const { done, total } = state.progress;
  const exit = () => {
    // With at least one grade, "Завершить" shows the summary first; otherwise leave.
    if (!controller.finish()) onExit();
  };

  return (
    <div className="practice">
      <p className="practice-eyebrow">Тренировка · без влияния на расписание</p>
      <div className="session-progress">
        <span>
          {done + 1} из {total}
        </span>
        <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="progress-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <button type="button" className="btn-link session-exit" onClick={exit}>
          Завершить
        </button>
      </div>
      <div className="card-panel">
        <span className="state-badge practice-badge">
          забыто {countLabel(current.card.scheduling.lapses, TIME_FORMS)}
        </span>
        <div className="card-front">{current.front}</div>
        {state.revealed ? (
          <>
            <div className="card-back">{current.back}</div>
            {(state.context?.example || state.context?.memo) && (
              <div className="answer-details">
                {state.context?.example && (
                  <section className="answer-context" aria-labelledby="practice-example-label">
                    <h3 id="practice-example-label" className="answer-context-label">
                      Пример
                    </h3>
                    <p className="answer-context-text answer-example">{state.context.example}</p>
                  </section>
                )}
                {state.context?.memo && (
                  <section className="answer-context" aria-labelledby="practice-memo-label">
                    <h3 id="practice-memo-label" className="answer-context-label">
                      Моя заметка
                    </h3>
                    <p className="answer-context-text">{state.context.memo}</p>
                  </section>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <button className="btn-primary" onClick={() => controller.reveal()}>
              Показать ответ
            </button>
            <span className="hotkey-hint">Пробел</span>
          </>
        )}
      </div>
      {state.revealed && (
        <div className="answer-bar">
          <div className="answer-buttons practice-buttons">
            {PRACTICE_GRADES.map((g) => (
              <button key={g} type="button" className={`practice-grade grade-${g}`} onClick={() => controller.grade(g)}>
                {PRACTICE_GRADE_LABELS[g]}
              </button>
            ))}
          </div>
          <div className="hotkey-hint">1 · 2 · 3</div>
        </div>
      )}
    </div>
  );
}
