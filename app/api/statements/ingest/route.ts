
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extractTablesAndRejections,
  UnsupportedPdfError,
} from "@/lib/pdf/extract-tables";
import { ingestStatement } from "@/lib/db/ingest";
import { createServerClient } from "@/lib/supabase/client";

// Force dynamic to prevent static generation issues
export const dynamic = 'force-dynamic';

// Ensure Node.js runtime for pdf-parse compatibility
export const runtime = "nodejs";

// Allow up to 30 seconds for PDF processing and DB operations
export const maxDuration = 30;

/** Maximum file size in bytes (2 MB to be safe for statements) */
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

/** Allowed MIME types for PDF files */
const ALLOWED_MIME_TYPES = ["application/pdf"];

export async function POST(request: Request) {
  try {
    // Check rate limit first
    const { rateLimited } = await checkRateLimit(request);
    if (rateLimited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // Authenticate user
    const supabase = createServerClient();
    
    // Extract token from Authorization header or cookie
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
        return NextResponse.json(
            { error: "Unauthorized. Missing access token." },
            { status: 401 }
        );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
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

    // Optional household member attribution. Multi-valued: a statement can
    // legitimately belong to several members (joint cards, supplementary
    // cards). Accepts repeated `member_ids` form-data fields. RLS on
    // statement_members ensures cross-user inserts fail.
    const memberIds = formData
      .getAll('member_ids')
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

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

    // Validate file size after reading
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max size is 4 MB." },
        { status: 413 }
      );
    }

    // 1. Extract tables + statement metadata from PDF.
    const { tables, statementMetadata } = await extractTablesAndRejections(buffer);

    // Flatten transactions from tables. Dates are now header-resolved
    // YYYY-style ("04 DEC 2025") so we can derive the period from them
    // reliably when the header anchor was missing.
    const allRows: any[] = tables.flatMap((t) =>
      t.rows.map((row) => ({
        date: row[0],
        description: row[1],
        amount: parseFloat(row[2].replace(/,/g, '')),
        balance: row[3] ? parseFloat(row[3].replace(/,/g, '')) : undefined,
      })),
    ).filter((r) => !isNaN(r.amount));
    console.log(`Extracted ${allRows.length} rows from PDF`);
    console.log('Statement metadata:', statementMetadata);

    // 2. Choose period: header-derived first, then fall back to the row
    // span. Dates are already YYYY-anchored so Date() parses them safely.
    let periodStart = statementMetadata.periodStart ?? '';
    let periodEnd = statementMetadata.periodEnd ?? '';

    if ((!periodStart || !periodEnd) && allRows.length > 0) {
      const timestamps = allRows
        .map((r) => new Date(r.date).getTime())
        .filter((t) => Number.isFinite(t) && t > 0);
      if (timestamps.length > 0) {
        if (!periodStart) {
          periodStart = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
        }
        if (!periodEnd) {
          periodEnd = new Date(Math.max(...timestamps)).toISOString().split('T')[0];
        }
      }
    }
    if (!periodStart) periodStart = new Date().toISOString().split('T')[0];
    if (!periodEnd) periodEnd = new Date().toISOString().split('T')[0];

    // 3. Ingest into Database — pass statement-derived bank/type so the
    // ingester doesn't have to fall back to filename heuristics.
    const result = await ingestStatement({
      fileName: file.name,
      fileBuffer: buffer,
      rows: allRows,
      metadata: {
        periodStart,
        periodEnd,
        bank: statementMetadata.bank ?? undefined,
        statementType: statementMetadata.statementType,
        accountLast4: statementMetadata.accountLast4 ?? undefined,
        currency: statementMetadata.currency ?? undefined,
        expectedTotal: statementMetadata.expectedTotal,
        expectedTotalKind: statementMetadata.expectedTotalKind,
        previousBalance: statementMetadata.previousBalance,
        memberIds,
      },
      userId: user.id,
    });

    // No background tagging here — suggestions now run on-demand when the
    // user opens TagInput on /transactions. Embeddings for those rows are
    // computed inside confirmStatementImport once the user accepts them.
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    if (error instanceof UnsupportedPdfError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("Ingest error:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred while processing the statement." },
      { status: 500 }
    );
  }
}
