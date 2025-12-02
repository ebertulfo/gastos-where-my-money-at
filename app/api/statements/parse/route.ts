import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extractTablesFromPdf,
  UnsupportedPdfError,
} from "@/lib/pdf/extract-tables";
import type { ParseSuccessResponse, ParseErrorResponse } from "@/lib/pdf/types";

// Ensure Node.js runtime for pdf-parse compatibility
export const runtime = "nodejs";

// Allow up to 20 seconds for PDF processing
export const maxDuration = 20;

/** Maximum file size in bytes (1 MB) */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/** Allowed MIME types for PDF files */
const ALLOWED_MIME_TYPES = ["application/pdf"];

/**
 * POST /api/statements/parse
 *
 * Accepts a PDF file upload, extracts tabular data, and returns as JSON.
 * Does not store the PDF or extracted data anywhere.
 */
export async function POST(
  request: Request
): Promise<NextResponse<ParseSuccessResponse | ParseErrorResponse>> {
  try {
    // Check rate limit first
    const { rateLimited } = await checkRateLimit(request);
    if (rateLimited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // Parse the multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request. Expected multipart/form-data." },
        { status: 400 }
      );
    }

    // Get the file from the form data
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file. Please upload a PDF file." },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are allowed." },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file size after reading (more accurate than Content-Length)
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max size is 1 MB." },
        { status: 413 }
      );
    }

    // Extract tables from PDF
    const tables = await extractTablesFromPdf(buffer);

    return NextResponse.json({ tables }, { status: 200 });
  } catch (error) {
    // Handle unsupported PDF errors (scanned, no tables, etc.)
    if (error instanceof UnsupportedPdfError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    // Log unexpected errors server-side only (don't expose details to client)
    console.error("PDF parse error:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred while processing the PDF." },
      { status: 500 }
    );
  }
}
