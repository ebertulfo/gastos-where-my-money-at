import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { checkRateLimit } from '@/lib/rate-limit'
import {
  extractTablesAndRejections,
  UnsupportedPdfError,
} from '@/lib/pdf/extract-tables'
import { ingestStatement } from '@/lib/db/ingest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow extra wall time so the AI categorization (free signals + LLM)
// completes during ingest. ~10s parse, ~3s embed batch, ~10-30s LLM cold tail.
export const maxDuration = 90

const MAX_FILE_SIZE = 4 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['application/pdf']

export async function POST(request: Request) {
  try {
    const { rateLimited } = await checkRateLimit(request)
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      )
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 },
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request. Expected multipart/form-data.' },
        { status: 400 },
      )
    }

    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file. Please upload a PDF file.' },
        { status: 400 },
      )
    }

    const memberIds = formData
      .getAll('member_ids')
      .filter((v): v is string => typeof v === 'string' && v.length > 0)

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed.' },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Max size is 4 MB.' },
        { status: 413 },
      )
    }

    const { tables, statementMetadata } = await extractTablesAndRejections(buffer)

    const allRows = tables
      .flatMap(t =>
        t.rows.map(row => ({
          date: row[0],
          description: row[1],
          amount: parseFloat(row[2].replace(/,/g, '')),
          balance: row[3] ? parseFloat(row[3].replace(/,/g, '')) : undefined,
        })),
      )
      .filter(r => !isNaN(r.amount))

    let periodStart = statementMetadata.periodStart ?? ''
    let periodEnd = statementMetadata.periodEnd ?? ''

    if ((!periodStart || !periodEnd) && allRows.length > 0) {
      const timestamps = allRows
        .map(r => new Date(r.date).getTime())
        .filter(t => Number.isFinite(t) && t > 0)
      if (timestamps.length > 0) {
        if (!periodStart) {
          periodStart = new Date(Math.min(...timestamps)).toISOString().split('T')[0]
        }
        if (!periodEnd) {
          periodEnd = new Date(Math.max(...timestamps)).toISOString().split('T')[0]
        }
      }
    }
    if (!periodStart) periodStart = new Date().toISOString().split('T')[0]
    if (!periodEnd) periodEnd = new Date().toISOString().split('T')[0]

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
      userId,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof UnsupportedPdfError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    console.error('Ingest error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the statement.' },
      { status: 500 },
    )
  }
}
