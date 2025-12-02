"use client";

import { useState, useRef } from "react";
import type { ParsedTable } from "@/lib/pdf/types";

type ParseResult =
  | { success: true; tables: ParsedTable[] }
  | { success: false; error: string };

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/statements/parse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, tables: data.tables });
      } else {
        setResult({ success: false, error: data.error });
      }
    } catch {
      setResult({ success: false, error: "Failed to upload file. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-4xl px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            PDF Statement Parser
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Upload a bank or credit card statement PDF to extract transaction tables.
          </p>
        </div>

        {/* Upload Section */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <label
            htmlFor="pdf-upload"
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 py-10 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
          >
            <svg
              className="mb-3 h-10 w-10 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {isLoading ? "Processing..." : "Click to upload PDF"}
            </span>
            <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Max 1 MB
            </span>
            <input
              ref={fileInputRef}
              id="pdf-upload"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>

          {fileName && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                📄 {fileName}
              </span>
              <button
                onClick={handleReset}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="mt-6 flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400" />
          </div>
        )}

        {/* Error State */}
        {result && !result.success && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>
          </div>
        )}

        {/* Success State - Tables */}
        {result && result.success && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Extracted Tables ({result.tables.length})
              </h2>
            </div>

            {result.tables.map((table, tableIndex) => (
              <div
                key={tableIndex}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Table {tableIndex + 1} — Page {table.page}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {table.rows.length} rows
                    {table.headers && ` • ${table.headers.length} columns`}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    {table.headers && (
                      <thead className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                        <tr>
                          {table.headers.map((header, i) => (
                            <th
                              key={i}
                              className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {table.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        >
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-4 py-2 text-zinc-600 dark:text-zinc-400"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
