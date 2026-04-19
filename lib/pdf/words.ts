/**
 * Extracts word-level positional text from a PDF using `unpdf`, which wraps
 * pdfjs-dist in a form that works cleanly across Next.js/Turbopack, Node.js
 * serverless runtimes, and edge workers without the fake-worker path bugs
 * we hit when importing pdfjs-dist directly.
 *
 * Each returned word carries its bounding box in PDF user-space points
 * (origin top-left after the Y flip applied below) so the layout-aware
 * parser can work off real column x-positions.
 */

// MUST be first — patches Promise.try so unpdf can load on Node 22.14.
import "./polyfill-promise-try";

import { getDocumentProxy } from "unpdf";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type Word = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
};

export type PageWords = {
  pageNumber: number;
  /** Full flat text for quick heuristics (no sort, no layout reconstruction). */
  text: string;
  words: Word[];
};

/**
 * Load a PDF buffer and return every page's words + flat text.
 */
export async function extractPageWords(buffer: Buffer): Promise<PageWords[]> {
  const data = new Uint8Array(buffer);
  const doc = await getDocumentProxy(data, {
    // The pdf.js fake worker is unnecessary in Node — `unpdf` handles worker
    // setup for us. Turn off font faces to avoid pulling browser-only deps.
    disableFontFace: true,
    isEvalSupported: false,
  });

  try {
    const pages: PageWords[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;

      const textContent = await page.getTextContent();

      const words: Word[] = [];
      const textParts: string[] = [];

      for (const rawItem of textContent.items) {
        const item = rawItem as TextItem;
        const raw = item.str;
        if (!raw) {
          if (item.hasEOL) textParts.push("\n");
          continue;
        }

        // pdfjs transform: [a, b, c, d, e, f] — translation is (e, f) in PDF
        // user space (origin bottom-left). Flip Y so y0 < y1 top-to-bottom.
        const [, , , , tx, ty] = item.transform;
        const width = item.width ?? 0;
        const height = item.height ?? 0;

        const x0 = tx;
        const x1 = tx + width;
        const flippedY1 = pageHeight - ty;
        const flippedY0 = flippedY1 - height;

        // Split on whitespace inside a single TextItem: pdfjs occasionally
        // returns multi-word items when the source PDF uses long glyph runs.
        // Approximate per-word bounds by proportional width.
        const parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
          if (item.hasEOL) textParts.push("\n");
          continue;
        }

        const totalChars = parts.reduce((acc, part) => acc + part.length, 0);
        let cursor = 0;
        for (const part of parts) {
          const share = totalChars > 0 ? part.length / totalChars : 1 / parts.length;
          const partWidth = width * share;
          const partX0 = x0 + (width * cursor) / Math.max(totalChars, 1);
          cursor += part.length;
          words.push({
            x0: partX0,
            y0: flippedY0,
            x1: partX0 + partWidth,
            y1: flippedY1,
            text: part,
          });
          textParts.push(part);
          textParts.push(" ");
        }

        if (item.hasEOL) textParts.push("\n");
      }

      pages.push({
        pageNumber,
        text: textParts.join("").replace(/[ \t]+\n/g, "\n").trim(),
        words,
      });

      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
