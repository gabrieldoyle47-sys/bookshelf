/**
 * Remembering a series: "Previously on…" recaps, built only from what is
 * already known - each earlier book's own description and the reader's note
 * on it. No AI, nothing invented, so nothing in it can be wrong about the plot
 * in a way the book's own blurb is not.
 *
 * Pure, so it is tested.
 */

// Publisher lines that say nothing about the story.
const PUFF = /bestsell|new york times|award[- ]winning|#1|praise|acclaimed|now a major|instant|edition|includes|copies sold|bonus|perfect for fans|for fans of|readers? (of|who)/i;

/** The first sentences of a description that are about the story, up to a length. */
export function storySentences(text, { max = 2, chars = 320 } = {}) {
  if (!text) return '';
  const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = plain.match(/[^.!?…]+(?:[.!?…]+["'”’)]?|$)/g) ?? [];
  const out = [];
  let length = 0;
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (PUFF.test(s) || s.length < 12) continue;
    if (out.length >= max || length + s.length > chars) break;
    out.push(s);
    length += s.length;
  }
  if (!out.length && sentences[0]) return `${sentences[0].trim().slice(0, chars - 1)}…`;
  return out.join(' ');
}

/**
 * The books a recap covers: the reader's finished books in this series that
 * come before `beforePosition`, in order. Novellas count if they were read.
 */
export function earlierBooks(library, seriesId, beforePosition) {
  return (library?.books ?? [])
    .filter((b) => b.series?.id === String(seriesId) && b.status === 'read'
      && typeof b.series.position === 'number' && b.series.position < beforePosition)
    .sort((a, b) => a.series.position - b.series.position);
}
