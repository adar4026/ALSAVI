/** "через сколько" для кнопок ответа: 1 мин / 3 ч / 5 дн / 2 мес */
export function formatInterval(fromMs: number, toMs: number): string {
  const minutes = Math.max(1, Math.round((toMs - fromMs) / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} дн`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} мес`;
  return `${(days / 365).toFixed(1)} г`;
}
