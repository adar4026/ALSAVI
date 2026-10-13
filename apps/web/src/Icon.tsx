/**
 * Inline SVG icons (TASK_029): a handful of simple line icons drawn for
 * ALSAVI, coloured by `currentColor` so they follow the theme. No icon
 * library — the PWA stays small and works offline. Always decorative
 * (`aria-hidden`): the control that holds an icon carries the text label.
 */
import type { ReactElement } from 'react';

export type IconName =
  | 'flame'
  | 'sliders'
  | 'cards'
  | 'target'
  | 'plus'
  | 'arrow-right'
  | 'chevron-right'
  | 'home'
  | 'chart'
  | 'user'
  | 'play';

const PATHS: Record<IconName, ReactElement> = {
  flame: (
    <path d="M12 3c.8 3.2 4.8 5.2 4.8 10.2A4.8 4.8 0 0 1 12 18a4.8 4.8 0 0 1-4.8-4.8c0-2.4 1.3-3.9 2.3-4.9.3 1.6 1.1 2.6 2.3 3C11.8 8.6 11 6 12 3Z" />
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7.5" width="13.5" height="13" rx="2.5" />
      <path d="M7.5 4.5h10A2.5 2.5 0 0 1 20 7v10" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />,
  chart: <path d="M5 20V11M12 20V4.5M19 20v-6.5M3.5 20.5h17" />,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
