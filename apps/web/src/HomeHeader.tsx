import { StreakChip } from './StreakChip';

/** The logo, from the PWA icons already in `public/` (and in the precache). */
export const LOGO_SRC = `${import.meta.env.BASE_URL}icons/icon-192.png`;

/** ALSAVI logo + name: the brand row of the home header and the side navigation. */
export function Brand() {
  return (
    <span className="brand">
      <img className="brand-logo" src={LOGO_SRC} alt="" width={32} height={32} />
      <span className="brand-name">ALSAVI</span>
    </span>
  );
}

/**
 * Home header (TASK_037, was `AppHeader`): the brand lives only on "Главная"
 * (D-15) — the logo instead of the "A" mark, the name and the streak. The
 * settings button is gone: "Профиль" is a tab (N-1). Other sections open with
 * their own large title (`ScreenHeader`); the study session has no header at
 * all. On a computer the brand and the streak are in the side navigation, so
 * this header is hidden there (CSS).
 */
export function HomeHeader({ streakDays, reviewedToday }: { streakDays: number | null; reviewedToday: boolean }) {
  return (
    <header className="home-header">
      <Brand />
      <StreakChip streakDays={streakDays} reviewedToday={reviewedToday} />
    </header>
  );
}
