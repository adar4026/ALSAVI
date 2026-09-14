import type { CardState, LearningEngine, Rating, StudySession } from '@alsavi/engine';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { formatInterval } from './format';
import { ReviewFlowController } from './review-flow';

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
 * Per-card session screen (TASK_022): front → "Показать ответ" → back + four
 * rating buttons with real intervals from `engine.previewIntervals()` →
 * progress → finished summary. All sequencing, save-locking and error
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

  // Keyboard shortcuts: Space/Enter show the answer, or grade "Хорошо" once
  // revealed; 1..4 grade the revealed card explicitly. Ignored while typing
  // in a field (none on this screen, but consistent with the rest of the
  // app), while saving, or before a card has loaded.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (state.status !== 'active' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (!state.revealed) {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          controller.reveal();
        }
        return;
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        void controller.answer('good');
        return;
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx !== -1) {
        e.preventDefault();
        void controller.answer(RATINGS[idx]!);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status, state.revealed, controller]);

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
          <div className="card-back">{current.back}</div>
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
        <>
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
        </>
      )}
    </div>
  );
}
