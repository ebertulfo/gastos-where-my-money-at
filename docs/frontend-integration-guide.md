# Frontend Architecture & Backend Integration Guide

_Last updated: 2025-12-05_

This document describes the current frontend implementation for M1 (Statement Ingestion MVP) and provides the API contracts that the backend needs to implement.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Pages (app/)                          │
│  ┌──────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │  page.tsx │  │ imports/[id]/review │  │ transactions  │  │
│  │  (Home)   │  │     page.tsx        │  │   page.tsx    │  │
│  └─────┬─────┘  └──────────┬──────────┘  └───────┬───────┘  │
│        │                   │                     │          │
├────────┴───────────────────┴─────────────────────┴──────────┤
│                     Custom Hooks (lib/hooks/)                │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐  │
│  │useStatementUpload│ │useStatementReview│ │useTransactions│ │
│  └────────┬─────────┘ └────────┬─────────┘ └──────┬──────┘  │
│           │                    │                  │          │
├───────────┴────────────────────┴──────────────────┴──────────┤
│                  Service Layer (lib/services/)               │
│              ┌─────────────────────────────┐                 │
│              │   statement-service.ts      │ ◀── REPLACE     │
│              │   (currently mock data)     │     WITH REAL   │
│              └─────────────────────────────┘     API CALLS   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Files to Modify for Backend Integration

### Primary Integration Point
**`lib/services/statement-service.ts`** — All mock API functions live here. Replace implementations with real fetch calls.

### Supporting Files (read-only reference)
| File | Purpose |
|------|---------|
| `lib/types/transaction.ts` | TypeScript interfaces for all data models |
| `lib/services/mock-data.ts` | Sample data (can be deleted after integration) |
| `lib/hooks/*.ts` | Custom hooks that consume the service layer |

---

## 3. API Contracts

### 3.1 Upload Statement

**Current mock:** `uploadStatement(file: File)`

**Expected backend endpoint:**
```
POST /api/statements/upload
Content-Type: multipart/form-data

Body: { file: File }

Response: {
  statementId: string
}
```

**Frontend usage:**
```typescript
const { statementId } = await uploadStatement(file)
// Then redirect to /imports/${statementId}/review
```

---

### 3.2 Parse Statement (Progress Streaming)

**Current mock:** `parseStatementProgress(statementId: string)` — Returns an AsyncGenerator

**Expected backend:** Server-Sent Events or polling endpoint

**Progress steps the frontend expects:**
```typescript
type ParsingStep = 
  | 'uploading'
  | 'reading'
  | 'detecting'
  | 'extracting'
  | 'sanitizing'
  | 'checking_duplicates'
  | 'complete'
  | 'error'

// Each progress update should return:
{
  step: ParsingStep
  progress: number  // 0-100
  error?: string    // Only if step === 'error'
}
```

**Option A: Server-Sent Events**
```
GET /api/statements/:statementId/parse/stream
Accept: text/event-stream

data: {"step": "reading", "progress": 25}
data: {"step": "extracting", "progress": 65}
data: {"step": "complete", "progress": 100}
```

**Option B: Polling**
```
GET /api/statements/:statementId/parse/status

Response: {
  step: ParsingStep
  progress: number
  error?: string
}
```

---

### 3.3 Get Statement Review

**Current mock:** `getStatementReview(statementId: string)`

**Expected backend endpoint:**
```
GET /api/statements/:statementId/review

Response: {
  statement: Statement
  newTransactions: Transaction[]
  duplicates: DuplicatePair[]
}
```

**TypeScript interfaces:**
```typescript
interface Statement {
  id: string
  bankName: string
  accountLabel?: string
  periodStart: string     // ISO date
  periodEnd: string       // ISO date
  currency: string
  transactionCount: number
  status: 'parsed' | 'reviewing' | 'ingested' | 'failed'
  fileHash: string
  createdAt: string       // ISO datetime
}

interface Transaction {
  id: string
  date: string            // ISO date
  description: string
  amount: number          // Negative for expenses, positive for income
  currency: string
  source: string          // Bank short name (DBS, POSB, etc.)
  monthBucket: string     // YYYY-MM format
  transactionIdentifier: string
  statementId: string
  createdAt: string       // ISO datetime
}

interface DuplicatePair {
  existing: Transaction   // Already in database
  new: Transaction        // From this import
  importId: string        // Unique ID for this import decision
}
```

---

### 3.4 Confirm Import

**Current mock:** `confirmImport(decisions: ImportDecisions)`

**Expected backend endpoint:**
```
POST /api/statements/:statementId/confirm

Body: {
  statementId: string
  decisions: Array<{
    importId: string
    action: 'accept' | 'reject'
  }>
}

Response: {
  success: boolean
}
```

**Behavior:**
- New transactions are always `accept`
- Duplicates default to `reject` (keep existing) unless user changes to `accept`
- After confirmation, statement status should change to `ingested`

---

### 3.5 Get Transactions

**Current mock:** `getTransactions(month?: string)`

**Expected backend endpoint:**
```
GET /api/transactions?month=YYYY-MM

Response: Transaction[]
```

---

### 3.6 Get Month Summary

**Current mock:** `getMonthSummary(month: string)`

**Expected backend endpoint:**
```
GET /api/transactions/summary?month=YYYY-MM

Response: {
  month: string           // YYYY-MM
  totalSpent: number      // Sum of negative amounts (as positive)
  transactionCount: number
  statementCount: number
  currency: string
}
```

---

### 3.7 Get Available Months

**Current mock:** `getAvailableMonthsList()`

**Expected backend endpoint:**
```
GET /api/transactions/months

Response: string[]   // ["2025-11", "2025-10", "2025-09"] sorted descending
```

---

### 3.8 Get Statements (Recent Imports)

**Current mock:** `getStatements()`

**Expected backend endpoint:**
```
GET /api/statements

Response: Statement[]   // Sorted by createdAt descending
```

---

## 4. Example: Replacing a Mock Function

**Before (mock):**
```typescript
// lib/services/statement-service.ts
export async function getTransactions(month?: string): Promise<Transaction[]> {
  await delay(300)
  if (month) {
    return mockTransactions.filter(t => t.monthBucket === month)
  }
  return mockTransactions
}
```

**After (real API):**
```typescript
// lib/services/statement-service.ts
export async function getTransactions(month?: string): Promise<Transaction[]> {
  const url = month 
    ? `/api/transactions?month=${month}` 
    : '/api/transactions'
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch transactions')
  }
  return response.json()
}
```

---

## 5. Error Handling

The hooks expect errors to be thrown as standard JavaScript Error objects. The UI will display `error.message` to the user.

**Error response format from backend:**
```json
{
  "error": "Human-readable error message"
}
```

---

## 6. Current Page Routes

| Route | Purpose | Primary API Calls |
|-------|---------|-------------------|
| `/` | Upload/Home | `getStatements()`, `uploadStatement()`, `parseStatementProgress()` |
| `/imports/[statementId]/review` | Review Import | `getStatementReview()`, `confirmImport()` |
| `/transactions` | Transaction List | `getTransactions()`, `getMonthSummary()`, `getAvailableMonthsList()` |
| `/summary` | Month Summary (stub) | N/A (coming in M3) |

---

## 7. Testing the Integration

1. Replace mock functions in `lib/services/statement-service.ts` one at a time
2. Test each flow:
   - Upload a PDF → parsing progress → review screen
   - Accept/reject duplicates → confirm import
   - View transactions list with month filter
3. Once all endpoints work, delete `lib/services/mock-data.ts`
