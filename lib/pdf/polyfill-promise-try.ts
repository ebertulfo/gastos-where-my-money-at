/**
 * Runtime polyfill for `Promise.try`, which is only available in Node 22.15+.
 * unpdf's bundled pdfjs-dist relies on it; without this polyfill, Node 22.14
 * (and earlier) throws "Promise.try is not a function" when opening a PDF.
 *
 * This file has no exports: its sole purpose is the import-side-effect of
 * patching the global `Promise`. Import it BEFORE `unpdf` in any module
 * that opens PDFs.
 */

if (typeof (Promise as unknown as { try?: unknown }).try !== "function") {
  (
    Promise as unknown as {
      try: <T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) => Promise<T>;
    }
  ).try = function pTry(fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}
