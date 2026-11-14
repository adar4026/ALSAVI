/**
 * Number stepper arithmetic (TASK_036): one step up or down, clamped to the
 * bounds; non-integers and out-of-range input are pulled back in. Pure, tested
 * in `ui-kit.test.ts`. The "Новых карточек в день" setting (TASK_043) uses
 * it with the same bounds `assertValidNewCardsPerDay` accepts (an integer
 * ≥ 0; "no limit" is a separate switch, not a number).
 */
export interface StepperBounds {
  min: number;
  max: number;
  step?: number;
}

export function clampStep(value: number, { min, max }: StepperBounds): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function stepValue(value: number, direction: 1 | -1, bounds: StepperBounds): number {
  const step = bounds.step ?? 1;
  return clampStep(clampStep(value, bounds) + direction * step, bounds);
}

export function canStep(value: number, direction: 1 | -1, bounds: StepperBounds): boolean {
  const v = clampStep(value, bounds);
  return direction === 1 ? v < bounds.max : v > bounds.min;
}
