import type { CardState, LearningEngine, Rating, StudySession } from '@alsavi/engine';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { formatInterval } from './format';
import { ReviewFlowController } from './review-flow';
import { handleReviewKeydown } from './review-hotkeys';

const RATING_LABELS: Record<Rating, string> = {
  again: 'Не помню',
  hard: 'Трудно',
  good: 'Хорошо',
  easy: 'Легко',
};

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

const STATE_LABELS: Record<CardState, string> = {
  new: 'новая',
  learning: 'изучается',
  review: 'на повторении',
  relearning: 'переучивается',
};

interface Props {
  engine: LearningEngine;
  session: StudySession;
  onReviewed: () => void;
  /** Return to the "Учиться сегодня" home screen (empty state or finished screen). */
  onExit: () => void;
}

/**
 * Per-card session screen (TASK_022): front → "Показать ответ" → back (+ the
 * note's example and memo when filled in, TASK_024) + four rating buttons
 * with real intervals from `engine.previewIntervals()` → progress → finished
 * summary. All sequencing, save-locking and error
 * recovery live in `ReviewFlowController`; this component only renders its
 * state and forwards user actions.
 */
export function ReviewSession({ engine, session, onReviewed, onExit }: Props) {
  const controller = useMemo(() => new ReviewFlowController(engine, session), [engine, session]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    void controller.start();
  }, [controller]);

  const prevDoneRef = useRef(0);
  useEffect(() => {
    // Fires once per successfully recorded answer (done increases by exactly
    // 1 each time) — keeps the app-level stats bar in sync without the
    // controller knowing anything about the rest of the UI.
    if (state.progress.done > prevDoneRef.current) onReviewed();
    prevDoneRef.current = state.progress.done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.progress.done]);

  // Keyboard shortcuts — the screen's one keydown handler (TASK_022). Space/
  // Enter show the answer, or grade "Хорошо" once revealed; 1..4 grade the
  // revealed card explicitly. Which key does what, and when the browser's own
  // handling wins instead (focused button, form field, held key), lives in
  // `review-hotkeys.ts` (TASK_025). It reads the controller's current state at
  // the moment of the key press, so the listener is bound once per controller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleReviewKeydown(e, controller);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  if (state.status === 'loading') return <div className="card-panel" />;

  if (state.status === 'empty') {
    return (
      <div className="card-panel">
        <div className="empty-state">
          {state.limitReached ? (
            <>
              На сегодня всё. 🎉
              <br />
              Дневной лимит новых карточек достигнут — новые вернутся завтра.
            </>
          ) : (
            <>
              На сегодня всё. 🎉
              <br />
              Возвращайся, когда подойдёт срок следующего повторения.
            </>
          )}
        </div>
        <button className="btn-primary" onClick={onExit}>
          На главный
        </button>
      </div>
    );
  }

  if (state.status === 'finished') {
    const summary = state.summary!;
    return (
      <div className="card-panel">
        <div className="empty-state">
          На сегодня всё. 🎉
          <br />
          Повторено карточек: <strong>{summary.reviewed}</strong>
          <br />
          Из них новых: <strong>{summary.newReviewed}</strong>
        </div>
        <button className="btn-primary" onClick={onExit}>
          На главный
        </button>
      </div>
    );
  }

  // 'active' or 'saving' — a card is on screen.
  const current = state.current!;
  const preview = state.preview!;
  const now = Date.now();
  const position = Math.min(state.progress.done + 1, state.progress.total);
  const progressPct = state.progress.total > 0 ? (state.progress.done / state.progress.total) * 100 : 0;
  const saving = state.status === 'saving';

  return (
    <div>
      <div className="session-progress">
        <span>
          {position} из {state.progress.total}
        </span>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.progress.total}
          aria-valuenow={state.progress.done}
        >
          <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      <div className="card-panel">
        <span className={`state-badge state-${current.card.state}`}>{STATE_LABELS[current.card.state]}</span>
        <div className="card-front">{current.front}</div>
        {state.revealed ? (
          <>
            <div className="card-back">{current.back}</div>
            {(state.context?.example || state.context?.memo) && (
              <div className="answer-details">
                {state.context?.example && (
                  <section className="answer-context" aria-labelledby="answer-example-label">
                    <h3 id="answer-example-label" className="answer-context-label">
                      Пример
                    </h3>
                    <p className="answer-context-text answer-example">{state.context.example}</p>
                  </section>
                )}
                {state.context?.memo && (
                  <section className="answer-context" aria-labelledby="answer-memo-label">
                    <h3 id="answer-memo-label" className="answer-context-label">
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
            <button className="btn-primary" onClick={() => controller.reveal()} aria-label="Показать ответ">
              Показать ответ
            </button>
            <span className="hotkey-hint">Пробел</span>
          </>
        )}
      </div>
      {state.error && (
        <div className="save-error" role="alert">
          {state.error} Попробуй ещё раз.
        </div>
      )}
      {state.revealed && (
        // Sticky to the bottom of the viewport: a long example/memo scrolls
        // the page, but the rating buttons never leave the screen.
        <div className="answer-bar">
          <div className="answer-buttons">
            {RATINGS.map((r) => (
              <button
                key={r}
                onClick={() => void controller.answer(r)}
                disabled={saving}
                aria-label={`${RATING_LABELS[r]}. Следующий показ: ${formatInterval(now, preview[r])}`}
              >
                {RATING_LABELS[r]}
                <span className="interval">{formatInterval(now, preview[r])}</span>
              </button>
            ))}
          </div>
          <div className="hotkey-hint">1 · 2 · 3 · 4</div>
        </div>
      )}
    </div>
  );
}
