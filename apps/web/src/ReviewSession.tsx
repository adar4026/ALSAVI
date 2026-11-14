import type { LearningEngine, StudySession } from '@alsavi/engine';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { formatInterval } from './format';
import { ReviewFlowController } from './review-flow';
import { handleReviewKeydown } from './review-hotkeys';
import {
  cardUnit,
  GRADE_KEYS_HINT,
  GRADE_LABELS,
  GRADE_TONES,
  practiceOffer,
  SESSION_GRADES,
  sessionCounter,
  sessionEndText,
  wordSize,
  type SessionGrade,
} from './session-view';
import { SessionSummary } from './SessionSummary';
import { ActionDock, Badge, Banner, Button, RatingBar, SessionHeader, Skeleton, Stat, StatGroup, Surface } from './ui';

interface Props {
  engine: LearningEngine;
  session: StudySession;
  onReviewed: () => void;
  /**
   * Return to the home screen: from the end screens, or mid-session via "✕"
   * (the main navigation is hidden during a session). Leaving records
   * nothing; `StudySession` lives on in `App`, so "Продолжить обучение" picks
   * up today's queue where it stands.
   */
  onExit: () => void;
  /** Start the difficult-words practice from the end screen (TASK_038). */
  onPractice?: () => void;
}

/**
 * Study session screen (TASK_022, redesigned in TASK_038): a focus mode — the
 * word large in the upper part, the answer unfolds under it without moving
 * it, and the actions stay in one place at the bottom (`ActionDock`):
 * "Показать ответ", then the three grades with their real intervals
 * (ADR-006). A tap on the word also reveals the answer. All sequencing,
 * save-locking and error recovery live in `ReviewFlowController`; texts and
 * sizes in `session-view.ts`; this component only renders the state.
 */
export function ReviewSession({ engine, session, onReviewed, onExit, onPractice }: Props) {
  const controller = useMemo(() => new ReviewFlowController(engine, session), [engine, session]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  // The grade chosen by pointer, highlighted while its answer is saved.
  const [pressed, setPressed] = useState<SessionGrade | null>(null);
  const [difficultWords, setDifficultWords] = useState(0);

  useEffect(() => {
    void controller.start();
  }, [controller]);

  const prevDoneRef = useRef(0);
  useEffect(() => {
    // Fires once per successfully recorded answer (done increases by exactly
    // 1 each time) — keeps the app-level numbers in sync without the
    // controller knowing anything about the rest of the UI.
    if (state.progress.done > prevDoneRef.current) onReviewed();
    prevDoneRef.current = state.progress.done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.progress.done]);

  const cardId = state.current?.card.id;
  useEffect(() => {
    setPressed(null);
  }, [cardId]);

  // The end screen offers the practice when there are difficult words (a read).
  useEffect(() => {
    if (state.status !== 'finished' || !onPractice) return;
    let alive = true;
    void engine
      .getLearningStats()
      .then((s) => {
        if (alive) setDifficultWords(s.difficult.total);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state.status, engine, onPractice]);

  // Keyboard shortcuts — the screen's one keydown handler (TASK_022). Space/
  // Enter show the answer, or grade "Помню" once revealed; 1..3 grade the
  // revealed card explicitly (ADR-006). Which key does what, and when the
  // browser's own handling wins instead (focused button, form field, held
  // key), lives in `review-hotkeys.ts` (TASK_025).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleReviewKeydown(e, controller);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  if (state.status === 'loading') return <Skeleton variant="session" />;

  if (state.status === 'empty') {
    const end = sessionEndText(state.limitReached ? 'limit' : 'empty');
    return (
      <SessionSummary
        icon="check"
        quiet
        title={end.title}
        text={end.text}
        actions={
          <Button size="lg" block onClick={onExit}>
            На главную
          </Button>
        }
      />
    );
  }

  if (state.status === 'finished') {
    const summary = state.summary!;
    const end = sessionEndText('finished');
    const offer = onPractice ? practiceOffer(difficultWords) : null;
    return (
      <SessionSummary
        icon="check"
        title={end.title}
        text={end.text}
        stats={
          <StatGroup columns={2} className="session-summary-stats">
            <Stat label="Повторено" value={summary.reviewed} unit={cardUnit(summary.reviewed)} />
            <Stat label="Из них новых" value={summary.newReviewed} />
          </StatGroup>
        }
        actions={
          <>
            {offer && onPractice && (
              <Button variant="secondary" size="lg" block icon="target" onClick={onPractice}>
                {offer}
              </Button>
            )}
            <Button size="lg" block onClick={onExit} autoFocus>
              На главную
            </Button>
          </>
        }
      />
    );
  }

  // 'active' or 'saving' — a card is on screen.
  const current = state.current!;
  const preview = state.preview!;
  const now = Date.now();
  const saving = state.status === 'saving';
  const isForward = current.card.template === 'forward';
  const reveal = () => controller.reveal();
  const options = SESSION_GRADES.map((g) => {
    const interval = formatInterval(now, preview[g]);
    return {
      value: g,
      label: GRADE_LABELS[g],
      tone: GRADE_TONES[g],
      detail: interval,
      ariaLabel: `${GRADE_LABELS[g]}. Следующий показ: ${interval}`,
    };
  });

  return (
    <div className="session">
      <SessionHeader
        onClose={onExit}
        closeLabel="Завершить повторение"
        // Disabled while an answer is being saved: leave only after it is recorded.
        closeDisabled={saving}
        done={state.progress.done}
        total={state.progress.total}
        counter={sessionCounter(state.progress.done, state.progress.total)}
      />
      <div className="session-card ui-action-dock-space" key={current.card.id}>
        {/* A tap on the word reveals the answer too (pointer only; the button and Space stay the accessible ways). */}
        <div className="session-word-zone" onClick={state.revealed ? undefined : reveal}>
          {current.card.state === 'new' && <Badge tone="accent">Новое слово</Badge>}
          <p className={`session-word session-word--${wordSize(current.front)}`} lang={isForward ? 'es' : undefined}>
            {current.front}
          </p>
        </div>
        {state.revealed && (
          <div className="session-answer">
            <p className="session-translation" lang={isForward ? undefined : 'es'}>
              {current.back}
            </p>
            {state.context?.example && (
              <Surface variant="inset">
                <h2 className="session-context-label">Пример</h2>
                <p className="session-context-text" lang="es">
                  {state.context.example}
                </p>
              </Surface>
            )}
            {state.context?.memo && (
              <Surface variant="inset">
                <h2 className="session-context-label">Моя заметка</h2>
                <p className="session-context-text">{state.context.memo}</p>
              </Surface>
            )}
          </div>
        )}
      </div>
      <ActionDock>
        {state.error && <Banner tone="error">{state.error} Попробуй ещё раз.</Banner>}
        {state.revealed ? (
          <RatingBar
            options={options}
            pressed={pressed}
            disabled={saving}
            onRate={(g) => {
              setPressed(g);
              void controller.answer(g);
            }}
          />
        ) : (
          <Button size="lg" block className="session-reveal" onClick={reveal}>
            Показать ответ
          </Button>
        )}
        <p className="session-keys" aria-hidden="true">
          {state.revealed ? GRADE_KEYS_HINT : 'Пробел'}
        </p>
      </ActionDock>
    </div>
  );
}
