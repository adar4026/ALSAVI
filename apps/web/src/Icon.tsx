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
  | 'play'
  // TASK_036 (COMPONENT_LIBRARY §9)
  | 'close'
  | 'search'
  | 'sort'
  | 'tag'
  | 'chevron-down'
  | 'check'
  | 'archive'
  | 'restore'
  | 'edit'
  | 'bell'
  | 'palette'
  | 'download'
  | 'upload'
  | 'info'
  | 'refresh'
  | 'book'
  | 'minus';

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
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  sort: <path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3" />,
  tag: (
    <>
      <path d="M4 12.6V5a1 1 0 0 1 1-1h7.6a1 1 0 0 1 .7.3l6.4 6.4a1 1 0 0 1 0 1.4l-7.6 7.6a1 1 0 0 1-1.4 0l-6.4-6.4a1 1 0 0 1-.3-.7Z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </>
  ),
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  archive: (
    <>
      <rect x="3.5" y="5" width="17" height="4" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  restore: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-1 1.3-2-.6-1.2.2-2.5 1.5-2.5H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
  upload: <path d="M12 20V9M7 13.5l5-5 5 5M5 4.5h14" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9M19.5 4.5V9H15" />,
  book: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19" />,
  minus: <path d="M5 12h14" />,
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
