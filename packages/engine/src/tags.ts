/**
 * Canonical form of user tags (TASK_023): trimmed, inner whitespace collapsed,
 * a leading `#` dropped, lower-cased, empty values removed, duplicates removed
 * (first occurrence wins, order otherwise preserved). Pure and deterministic —
 * the Engine applies it on every write, so stored tags are always canonical.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}
