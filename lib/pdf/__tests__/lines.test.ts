import { describe, it, expect } from "vitest";
import { groupWordsIntoLines, normalizeWhitespace } from "../lines";
import type { Word } from "../words";

function w(text: string, x0: number, y0: number, x1 = x0 + text.length * 5, y1 = y0 + 10): Word {
  return { x0, y0, x1, y1, text };
}

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace", () => {
    expect(normalizeWhitespace("  hello\t world\n\nfoo  ")).toBe("hello world foo");
  });
  it("returns empty string for undefined/empty", () => {
    expect(normalizeWhitespace("")).toBe("");
    expect(normalizeWhitespace(undefined as unknown as string)).toBe("");
  });
});

describe("groupWordsIntoLines", () => {
  it("groups words sharing a y-center into one line and sorts left to right", () => {
    const words: Word[] = [
      w("world", 50, 0),
      w("hello", 10, 1),
      w("!", 90, 2),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("hello world !");
  });

  it("separates lines that differ by more than the y tolerance", () => {
    const words: Word[] = [
      w("first", 10, 0),
      w("line", 40, 0),
      w("second", 10, 20),
      w("line", 50, 20),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("first line");
    expect(lines[1].text).toBe("second line");
  });

  it("drops empty words and returns bounding box over the group", () => {
    const words: Word[] = [
      { x0: 10, y0: 0, x1: 30, y1: 10, text: "" },
      w("alpha", 10, 0, 40, 10),
      w("beta", 60, 0, 90, 12),
    ];
    const lines = groupWordsIntoLines(words);
    expect(lines).toHaveLength(1);
    expect(lines[0].x0).toBe(10);
    expect(lines[0].x1).toBe(90);
    expect(lines[0].y1).toBe(12);
  });
});
