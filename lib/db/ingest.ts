import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase/client';
import { generateTransactionIdentifier, normalizeDateToYyyyMmDd } from '@/lib/transaction-identifier';
import { Database } from '@/lib/supabase/database.types';

type StatementInsert = Database['public']['Tables']['statements']['Insert'];
type TransactionImportInsert = Database['public']['Tables']['transaction_imports']['Insert'];
type TransactionRow = {
  date: string;
  description: string;
  amount: number;
  balance?: number;
};

type StatementTypeValue = 'debit' | 'credit' | 'investment';

interface IngestOptions {
  fileName: string;
  fileBuffer: Buffer;
  rows: TransactionRow[];
  metadata: {
    periodStart?: string;
    periodEnd?: string;
    bank?: string;
    currency?: string;
    /**
     * Optional household_members.id list selected by the uploader. A
     * statement can belong to more than one member (joint cards,
     * supplementary cards). Empty/undefined = unspecified attribution.
     * RLS on statement_members ensures cross-user references fail.
     */
    memberIds?: string[];
  };
  userId: string;
}

// Best-effort bank slug from the original filename. Used only inside the
// redacted source_file_name; never round-tripped to display. Falls back to
// 'unknown' rather than guessing wildly. Order matters: longer/more specific
// tokens first so "dbs_posb" wins over "dbs".
const BANK_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/dbs[\s_-]*posb/i, 'dbs_posb'],
  [/standard[\s_-]*chartered|stan[\s_-]*chart/i, 'stanchart'],
  [/maybank/i, 'maybank'],
  [/citi(bank)?/i, 'citi'],
  [/hsbc/i, 'hsbc'],
  [/posb/i, 'posb'],
  [/ocbc/i, 'ocbc'],
  [/uob/i, 'uob'],
  [/dbs/i, 'dbs'],
];

function detectBankSlug(originalFileName: string): string {
  for (const [re, slug] of BANK_PATTERNS) {
    if (re.test(originalFileName)) return slug;
  }
  return 'unknown';
}

function detectStatementType(originalFileName: string): StatementTypeValue {
  if (/investment/i.test(originalFileName)) return 'investment';
  if (/credit/i.test(originalFileName)) return 'credit';
  return 'debit';
}

// {hash8}-{type}-{bank}-{MM-YYYY}.pdf — strips the original filename which
// often contains the user's real name (e.g. "DBS_POSB_JaneDoe_Dec2025.pdf").
function redactFileName(
  fileHash: string,
  type: StatementTypeValue,
  bankSlug: string,
  periodStart: string | undefined,
): string {
  const hash8 = fileHash.slice(0, 8);
  let mmYyyy = 'unknown';
  if (periodStart) {
    const d = new Date(periodStart);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = String(d.getFullYear());
      mmYyyy = `${mm}-${yyyy}`;
    }
  }
  return `${hash8}-${type}-${bankSlug}-${mmYyyy}.pdf`;
}

export async function ingestStatement({
  fileName,
  fileBuffer,
  rows,
  metadata,
  userId,
}: IngestOptions) {
  try {
  const supabase = createServerClient();
  console.log('Ingesting statement', fileName);
  // 1. Calculate File Hash
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

  // 2. Check if statement exists
  const { data: existingStatementData } = await (supabase as any)
    .from('statements')
    .select('id, status')
    .eq('source_file_sha256', fileHash)
    .eq('uploaded_by', userId)
    .maybeSingle();
    
  // Force cast to avoid 'never' type inference issue
  const existingStatement = existingStatementData as any;

  if (existingStatement) {
    return {
      success: true,
      statementId: existingStatement.id,
      isDuplicate: true,
      status: existingStatement.status,
    };
  }

  if (!metadata.periodStart || !metadata.periodEnd) {
      throw new Error("Statement period start and end are required.");
  }

  // 3. Privacy strip — derive type/bank from the original filename, then
  // replace it with a redacted form before persisting. account_name is
  // never stored.
  const statementType = detectStatementType(fileName);
  const bankSlug = metadata.bank ? metadata.bank.toLowerCase().replace(/\s+/g, '_') : detectBankSlug(fileName);
  const redactedFileName = redactFileName(fileHash, statementType, bankSlug, metadata.periodStart);

  // 4. Create Statement Record
  const statementData: StatementInsert = {
    source_file_name: redactedFileName,
    source_file_sha256: fileHash,
    uploaded_by: userId,
    period_start: metadata.periodStart,
    period_end: metadata.periodEnd,
    bank: metadata.bank || (bankSlug !== 'unknown' ? bankSlug : null),
    currency: metadata.currency || 'SGD',
    status: 'ingesting',
    statement_type: statementType,
  };

  const { data, error: statementError } = await (supabase as any)
    .from('statements')
    .insert(statementData)
    .select()
    .single();

  console.log('Created statement', data);
  // Explicitly cast or check to satisfy TS if inference fails
  const statement = data as any;

  if (statementError || !statement) {
    throw new Error(`Failed to create statement: ${statementError?.message}`);
  }

  // 4a. Attach members via the junction. Dedupe just in case; RLS
  // enforces ownership on insert. Empty array = unspecified attribution.
  const uniqueMemberIds = Array.from(new Set((metadata.memberIds ?? []).filter(Boolean)));
  if (uniqueMemberIds.length > 0) {
    const memberRows = uniqueMemberIds.map((mid) => ({
      statement_id: statement.id as string,
      member_id: mid,
    }));
    const { error: memberError } = await (supabase as any)
      .from('statement_members')
      .insert(memberRows);
    if (memberError) {
      // Don't fail ingest over attribution — statement is still useful.
      console.warn('Failed to attach members to statement', memberError);
    }
  }

  // 4. Prepare Transaction Imports
  const importRows: TransactionImportInsert[] = [];
  
  // ... (lines 90-126 unchanged, assuming correct) ...
  const transactionsWithIds = rows.map((row) => {
    // Use metadata year if available to help with ID generation
    let dateForId = row.date;
    if (metadata.periodStart) {
        const year = new Date(metadata.periodStart).getFullYear();
        if (row.date && !/\d{4}/.test(row.date)) {
             dateForId = `${row.date} ${year}`;
        }
    }
    
    const id = generateTransactionIdentifier({
      date: dateForId,
      amount: row.amount.toString(),
      balance: row.balance?.toString() || '0',
      description: row.description,
    });
    
    // Derive month bucket YYYY-MM from valid standardized date
    let monthBucket = '0000-00';
    try {
        // We re-use the normalization logic to ensure the bucket matches exactly what goes into the ID and DB
        const yyyyMmDd = normalizeDateToYyyyMmDd(dateForId);
        monthBucket = `${yyyyMmDd.substring(0, 4)}-${yyyyMmDd.substring(4, 6)}`;
    } catch (e) {
        console.warn("Invalid date for bucket", row.date);
    }

    return { ...row, transaction_identifier: id, month_bucket: monthBucket };
  });

  const allIds = transactionsWithIds.map(t => t.transaction_identifier);

  // Find duplicates in existing transactions
  const { data: duplicates } = await (supabase as any)
    .from('transactions')
    .select('id, transaction_identifier')
    .eq('user_id', userId)
    .in('transaction_identifier', allIds);

  const duplicateMap = new Map<string, string>(); // identifier -> existing_transaction_id
  if (duplicates) {
    duplicates.forEach((d: any) => duplicateMap.set(d.transaction_identifier, d.id));
  }

  // Build insert payload
  for (const t of transactionsWithIds) {
    console.log('Processing transaction', t);
    const existingId = duplicateMap.get(t.transaction_identifier);

    // Normalize date to YYYY-MM-DD for database
    // Re-construct the date used for ID generation to ensure consistency
    let dateForId = t.date;
    if (metadata.periodStart) {
        const year = new Date(metadata.periodStart).getFullYear();
        if (t.date && !/\d{4}/.test(t.date)) {
             dateForId = `${t.date} ${year}`;
        }
    }
    
    let dbDate = t.date;
    try {
        const yyyyMmDd = normalizeDateToYyyyMmDd(dateForId);
        dbDate = `${yyyyMmDd.substring(0, 4)}-${yyyyMmDd.substring(4, 6)}-${yyyyMmDd.substring(6, 8)}`;
    } catch (e) {
        console.warn('Failed to normalize date for DB:', t.date, e);
    }

    importRows.push({
      statement_id: statement.id,
      transaction_identifier: t.transaction_identifier,
      resolution: 'pending',
      existing_transaction_id: existingId || null,
      date: dbDate,
      month_bucket: t.month_bucket,
      description: t.description,
      amount: t.amount,
      balance: t.balance || null,
    });
  }

  console.log('Inserting imports, count:', importRows.length);
  // Batch insert
  const { error: importError } = await (supabase as any)
    .from('transaction_imports')
    .insert(importRows);

  if (importError) {
    // If imports fail, cleanup the statement so the user can retry
    await (supabase as any).from('statements').delete().eq('id', statement.id);
    throw new Error(`Failed to import transactions: ${importError.message}`);
  }

  // Update status to imported/parsed so it shows up in review
  await (supabase as any)
    .from('statements')
    .update({ status: 'parsed' }) // 'parsed' status indicates ready for review
    .eq('id', statement.id);

  return {
    success: true,
    statementId: statement.id,
    isDuplicate: false,
    count: importRows.length,
  };
} catch (error) {
  console.error('Error ingesting statement', error);
  throw error;
}
}
