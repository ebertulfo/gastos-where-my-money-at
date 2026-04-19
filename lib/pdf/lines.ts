/**
 * Group PyMuPDF-style word tuples into reconstructed visual lines.
 *
 * Direct port of `group_words_into_lines` at src/parser.py:163 in the Python
 * reference implementation. Unit-tested against the same fixture shape used
 * by the Python regression suite.
 */

import type { TextLine } from "./models";
import type { Word } from "./words";

export function normalizeWhitespace(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function groupWordsIntoLines(
  words: Word[],
  yTolerance = 3.0
): TextLine[] {
  const normalized = words
    .map((w) => ({
      x0: Number(w.x0),
      y0: Number(w.y0),
      x1: Number(w.x1),
      y1: Number(w.y1),
      text: (w.text ?? "").trim(),
    }))
    .filter((w) => w.text && Number.isFinite(w.x0) && Number.isFinite(w.y0));

  if (normalized.length === 0) return [];

  // Sort primarily by vertical center, secondarily by horizontal x0.
  normalized.sort((a, b) => {
    const ca = (a.y0 + a.y1) / 2;
    const cb = (b.y0 + b.y1) / 2;
    if (ca !== cb) return ca - cb;
    return a.x0 - b.x0;
  });

  const groups: Word[][] = [];
  let current: Word[] = [];
  let currentY: number | null = null;

  for (const word of normalized) {
    const wordY = (word.y0 + word.y1) / 2;
    if (currentY === null || Math.abs(wordY - currentY) <= yTolerance) {
      current.push(word);
      if (currentY === null) {
        currentY = wordY;
      } else {
        // Running mean of y centers, matches the Python impl exactly.
        currentY = (currentY * (current.length - 1) + wordY) / current.length;
      }
    } else {
      groups.push(current);
      current = [word];
      currentY = wordY;
    }
  }
  if (current.length > 0) groups.push(current);

  const lines: TextLine[] = [];
  for (const rawGroup of groups) {
    const group = [...rawGroup].sort((a, b) => a.x0 - b.x0);
    const text = normalizeWhitespace(group.map((w) => w.text).join(" "));
    if (!text) continue;
    lines.push({
      text,
      words: group,
      x0: Math.min(...group.map((w) => w.x0)),
      y0: Math.min(...group.map((w) => w.y0)),
      x1: Math.max(...group.map((w) => w.x1)),
      y1: Math.max(...group.map((w) => w.y1)),
    });
  }
  return lines;
}
