const MEDIA_REF = /\[(?:sound|anki):[^\]]*\]/gi; // [sound:x.mp3], [anki:...]
const HTML_TAG = /<[^>]*>/g; // any tag, incl. <img>, <br>, <font>

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&\w+;/g, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp: number): string {
  return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

/**
 * Turn a raw Anki field value into plain text for ALSAVI, which renders
 * front/back as plain text (no HTML, no media). Media refs and HTML tags are
 * replaced by spaces (so words never fuse), entities decoded, whitespace
 * collapsed. Media itself is not imported.
 */
export function stripToPlainText(raw: string): string {
  return decodeEntities(raw.replace(MEDIA_REF, ' ').replace(HTML_TAG, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
