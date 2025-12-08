
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extractTablesFromPdf,
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

    // 1. Extract tables from PDF
    const tables = await extractTablesFromPdf(buffer);

    // Flatten transactions from tables
    const allRows: any[] = tables.flatMap(t => t.rows.map(row => {
      // row is string[]: [Date, Description, Amount, Balance]
      return {
        date: row[0],
        description: row[1],
        amount: parseFloat(row[2].replace(/,/g, '')),
        balance: row[3] ? parseFloat(row[3].replace(/,/g, '')) : undefined
      };
    })).filter(r => !isNaN(r.amount)); 
    console.log(allRows);
    console.log(`Extracted ${allRows.length} rows from PDF`); 

    // Calculate metadata from rows
    let periodStart = '';
    let periodEnd = '';
    
    // Get year inferred by the PDF parser (e.g. found in header "Statement as of ... 2024")
    const inferredYear = tables.length > 0 ? tables[0].metadata?.inferredYear : undefined;

    if (allRows.length > 0) {
        // We need to parse arbitrary dates here to sort them.
        
        try {
            // Helpers to parse date string to timestamp
            const parseDate = (dStr: string) => {
                let d = new Date(dStr);
                
                // Check if year is present in the string (4 digits)
                const hasYear = /\d{4}/.test(dStr);
                
                // If the parser found a year in the document text, prefer that over current year
                const fallbackYear = inferredYear || new Date().getFullYear();
                
                if (!hasYear) {
                    d = new Date(`${dStr} ${fallbackYear}`);
                }

                // If still invalid or defaulted to 2001 (Node quirk for some formats)
                // OR if we want to confirm the year matches the inferred one
                if (isNaN(d.getTime()) || (d.getFullYear() === 2001 && !dStr.includes('2001'))) {
                     d = new Date(`${dStr} ${fallbackYear}`);
                }
                
                if (isNaN(d.getTime())) return 0;
                return d.getTime();
            };

            const timestamps = allRows.map(r => parseDate(r.date)).filter(t => t > 0);
            if (timestamps.length > 0) {
                const min = new Date(Math.min(...timestamps));
                const max = new Date(Math.max(...timestamps));
                periodStart = min.toISOString().split('T')[0];
                periodEnd = max.toISOString().split('T')[0];
            }
        } catch (e) {
            console.warn("Failed to infer dates", e);
        }
    }
    
    // Fallback if date inference failed
    if (!periodStart) periodStart = new Date().toISOString().split('T')[0];
    if (!periodEnd) periodEnd = new Date().toISOString().split('T')[0];

    // 2. Ingest into Database
    const result = await ingestStatement({
      fileName: file.name,
      fileBuffer: buffer,
      rows: allRows,
      metadata: {
        periodStart,
        periodEnd,
        // Optional metadata
        bank: undefined, 
        accountName: undefined,
      },
      userId: user.id,
    });

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
