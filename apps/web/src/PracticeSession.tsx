import type { CardView } from '@alsavi/engine';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  handlePracticeKeydown,
  PRACTICE_GRADE_LABELS,
  PRACTICE_GRADES,
  PracticeController,
  type PracticeGrade,
} from './practice-flow';
import { GRADE_KEYS_HINT, sessionCounter, wordSize } from './session-view';
import { SessionSummary } from './SessionSummary';
import { countLabel, TIME_FORMS } from './stats-view';
import { ActionDock, Badge, Button, RatingBar, SessionHeader, Skeleton, Stat, StatGroup, Surface } from './ui';

interface Props {
  /** Loads the cards to practise (`loadDifficultPractice`) — the screen's only data access. */
  loadCards: () => Promise<CardView[]>;
  /** Back to "Карточки" → "Трудные". Leaving records nothing — there is nothing to record. */
  onExit: () => void;
}

const PRACTICE_TONES: Record<PracticeGrade, 'danger' | 'warning' | 'success'> = {
  forgot: 'danger',
  hard: 'warning',
  good: 'success',
};

/** Always on screen: the practice never touches the schedule (TASK_032). */
const PRACTICE_LABEL = 'Тренировка · расписание не меняется';

/**
 * Difficult-words practice (TASK_032, on the study-session template since
 * TASK_038): the same header, word, answer and dock, the same three grades —
 * without intervals and without saving anything. A focus mode like the
 * session: `App` hides the navigation. All logic lives in
 * `PracticeController` (`practice-flow.ts`), which is unchanged.
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

  if (state.status === 'loading') return <Skeleton variant="session" />;

  if (state.status === 'error' || state.status === 'empty') {
    const error = state.status === 'error';
    return (
      <SessionSummary
        icon={error ? 'info' : 'check'}
        quiet
        overline="Тренировка трудных слов"
        title={error ? 'Не удалось начать тренировку' : 'Трудных слов нет'}
        text={error ? state.error : 'Повторять в тренировке пока нечего.'}
        actions={
          <>
            {error && (
              <Button size="lg" block onClick={() => void controller.start()}>
                Повторить попытку
              </Button>
            )}
            <Button variant={error ? 'secondary' : 'primary'} size="lg" block onClick={onExit}>
              К трудным словам
            </Button>
          </>
        }
      />
    );
  }

  if (state.status === 'finished') {
    const s = state.summary!;
    return (
      <SessionSummary
        icon="target"
        overline="Тренировка трудных слов"
        title="Тренировка завершена"
        stats={
          <StatGroup columns={3} className="session-summary-stats">
            <Stat label="Повторено" value={s.practised} />
            <Stat label="Помню" value={s.good} />
            <Stat label="С ошибкой" value={s.struggled} />
          </StatGroup>
        }
        actions={
          <>
            {s.struggled > 0 && (
              <Button size="lg" block onClick={() => void controller.retryStruggled()} autoFocus>
                Повторить слова с ошибками
              </Button>
            )}
            <Button
              variant={s.struggled > 0 ? 'secondary' : 'primary'}
              size="lg"
              block
              onClick={() => void controller.start()}
              autoFocus={s.struggled === 0}
            >
              Повторить ещё раз
            </Button>
            <Button variant="tertiary" className="session-summary-link" onClick={onExit}>
              К трудным словам
            </Button>
          </>
        }
      >
        {s.struggled > 0 && (
          <div className="session-summary-block">
            <p className="session-summary-note">
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
          </div>
        )}
        {state.progress.done < state.progress.total && (
          <p className="session-summary-note">
            Завершено досрочно: пройдено {state.progress.done} из {state.progress.total}.
          </p>
        )}
        <p className="session-summary-note">Тренировка не меняет расписание повторений и не попадает в статистику.</p>
      </SessionSummary>
    );
  }

  // 'active' — a card is on screen.
  const current = state.current!;
  const { done, total } = state.progress;
  const isForward = current.card.template === 'forward';
  const reveal = () => controller.reveal();
  const exit = () => {
    // With at least one grade, "✕" shows the summary first; otherwise leave.
    if (!controller.finish()) onExit();
  };
  const options = PRACTICE_GRADES.map((g) => ({ value: g, label: PRACTICE_GRADE_LABELS[g], tone: PRACTICE_TONES[g] }));

  return (
    <div className="session">
      <SessionHeader
        onClose={exit}
        closeLabel="Завершить тренировку"
        done={done}
        total={total}
        counter={sessionCounter(done, total)}
        label={PRACTICE_LABEL}
      />
      <div className="session-card ui-action-dock-space" key={current.card.id}>
        <div className="session-word-zone" onClick={state.revealed ? undefined : reveal}>
          <Badge tone="danger">забыто {countLabel(current.card.scheduling.lapses, TIME_FORMS)}</Badge>
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
        {state.revealed ? (
          <RatingBar options={options} onRate={(g) => controller.grade(g)} />
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
