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

interface IngestOptions {
  fileName: string;
  fileBuffer: Buffer;
  rows: TransactionRow[];
  metadata: {
    periodStart?: string;
    periodEnd?: string;
    accountName?: string;
    bank?: string;
    currency?: string;
  };
  userId: string;
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

  // 3. Create Statement Record
  const statementData: StatementInsert = {
    source_file_name: fileName,
    source_file_sha256: fileHash,
    uploaded_by: userId,
    period_start: metadata.periodStart,
    period_end: metadata.periodEnd,
    bank: metadata.bank || null,
    account_name: metadata.accountName || null,
    currency: metadata.currency || 'SGD', // Default to SGD for now
    status: 'ingesting',
    statement_type: 'bank', // Default, logic to detect type can be added later
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
