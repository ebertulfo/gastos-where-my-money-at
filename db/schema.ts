// db/schema.ts — Drizzle schema mirroring db/init.sql.
// Source of truth for the live DB is init.sql; this file is the typed
// surface for app-side queries. Keep them in sync when changing schema.

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================
export const statementTypeEnum = pgEnum('statement_type', [
  'debit',
  'credit',
  'investment',
]);
export const statementStatusEnum = pgEnum('statement_status', [
  'parsed',
  'ingesting',
  'ingested',
  'failed',
]);
export const importResolutionEnum = pgEnum('import_resolution', [
  'pending',
  'accepted',
  'rejected',
]);
export const transactionStatusEnum = pgEnum('transaction_status', [
  'active',
  'voided',
]);

// ============================================================================
// TABLES
// ============================================================================

export const statements = pgTable(
  'statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceFileName: text('source_file_name').notNull(),
    sourceFileSha256: text('source_file_sha256').notNull(),
    bank: text('bank'),
    accountLast4: text('account_last4'),
    statementType: statementTypeEnum('statement_type').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    currency: text('currency').notNull().default('PHP'),
    uploadedBy: text('uploaded_by').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: statementStatusEnum('status').notNull().default('parsed'),
    expectedTotal: decimal('expected_total', { precision: 15, scale: 2 }),
    expectedTotalKind: text('expected_total_kind'),
    previousBalance: decimal('previous_balance', { precision: 15, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('statements_user_file_hash_idx').on(
      t.uploadedBy,
      t.sourceFileSha256,
    ),
  ],
);

export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('household_members_user_name_lower_idx').on(
      t.userId,
      sql`lower(${t.name})`,
    ),
    index('household_members_user_id_idx').on(t.userId),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): any => tags.id),
    color: text('color'),
    kind: text('kind').notNull().default('label'),
    description: text('description'),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`timezone('utc'::text, now())`),
  },
  (t) => [
    uniqueIndex('tags_user_id_name_unique').on(t.userId, t.name),
    index('idx_tags_kind').on(t.kind),
    check('tags_kind_chk', sql`${t.kind} in ('category', 'label')`),
    check('tags_name_lowercase_chk', sql`${t.name} = lower(${t.name})`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    statementId: uuid('statement_id')
      .notNull()
      .references(() => statements.id, { onDelete: 'cascade' }),
    transactionIdentifier: text('transaction_identifier').notNull(),
    date: date('date').notNull(),
    monthBucket: text('month_bucket').notNull(),
    description: text('description').notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    balance: decimal('balance', { precision: 15, scale: 2 }),
    statementPage: integer('statement_page'),
    lineNumber: integer('line_number'),
    status: transactionStatusEnum('status').notNull().default('active'),
    isExcluded: boolean('is_excluded').notNull().default(false),
    exclusionReason: text('exclusion_reason'),
    descriptionEmbedding: vector('description_embedding', { dimensions: 1536 }),
    categoryId: uuid('category_id').references(() => tags.id, {
      onDelete: 'set null',
    }),
    categorySource: text('category_source'),
    isTravel: boolean('is_travel').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_user_identifier_idx').on(
      t.userId,
      t.transactionIdentifier,
    ),
    index('transactions_month_bucket_idx').on(t.userId, t.monthBucket),
    index('transactions_statement_id_idx').on(t.statementId),
    index('transactions_date_idx').on(t.userId, t.date.desc()),
    index('idx_transactions_category_id').on(t.categoryId),
    check(
      'transactions_category_source_chk',
      sql`${t.categorySource} is null or ${t.categorySource} in ('user', 'ai')`,
    ),
  ],
);

export const transactionImports = pgTable(
  'transaction_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    statementId: uuid('statement_id')
      .notNull()
      .references(() => statements.id, { onDelete: 'cascade' }),
    transactionIdentifier: text('transaction_identifier').notNull(),
    date: date('date').notNull(),
    monthBucket: text('month_bucket').notNull(),
    description: text('description').notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    balance: decimal('balance', { precision: 15, scale: 2 }),
    statementPage: integer('statement_page'),
    lineNumber: integer('line_number'),
    resolution: importResolutionEnum('resolution').notNull().default('pending'),
    existingTransactionId: uuid('existing_transaction_id').references(
      () => transactions.id,
      { onDelete: 'set null' },
    ),
    notes: text('notes'),
    isExcluded: boolean('is_excluded').default(false),
    exclusionReason: text('exclusion_reason'),
    descriptionEmbedding: vector('description_embedding', { dimensions: 1536 }),
    categoryId: uuid('category_id').references(() => tags.id, {
      onDelete: 'set null',
    }),
    categorySource: text('category_source'),
    isTravel: boolean('is_travel').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('transaction_imports_statement_id_idx').on(t.statementId),
    index('transaction_imports_resolution_idx').on(t.statementId, t.resolution),
    check(
      'transaction_imports_category_source_chk',
      sql`${t.categorySource} is null or ${t.categorySource} in ('user', 'ai')`,
    ),
  ],
);

export const transactionTags = pgTable(
  'transaction_tags',
  {
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`timezone('utc'::text, now())`),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    uniqueIndex('idx_transaction_tags_one_primary')
      .on(t.transactionId)
      .where(sql`${t.isPrimary} = true`),
  ],
);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  currency: text('currency').notNull().default('SGD'),
  country: text('country').notNull().default('SG'),
  autoTagEnabled: boolean('auto_tag_enabled').notNull().default(true),
  aiMonthlyBudgetCents: integer('ai_monthly_budget_cents')
    .notNull()
    .default(500),
  aiSpentThisMonthCents: integer('ai_spent_this_month_cents')
    .notNull()
    .default(0),
  aiBudgetResetAt: timestamp('ai_budget_reset_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const statementMembers = pgTable(
  'statement_members',
  {
    statementId: uuid('statement_id')
      .notNull()
      .references(() => statements.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => householdMembers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.statementId, t.memberId] }),
    index('statement_members_member_id_idx').on(t.memberId),
    index('statement_members_statement_id_idx').on(t.statementId),
  ],
);

// ============================================================================
// TYPE HELPERS — for use in app code (replaces lib/supabase/database.types.ts).
// ============================================================================
export type Statement = typeof statements.$inferSelect;
export type NewStatement = typeof statements.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionImport = typeof transactionImports.$inferSelect;
export type NewTransactionImport = typeof transactionImports.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TransactionTag = typeof transactionTags.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type StatementMember = typeof statementMembers.$inferSelect;
