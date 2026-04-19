# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Next.js dev server on :3000
npm run build         # Production build
npm run lint          # ESLint (eslint-config-next)
npm run test          # Vitest (watch)
npm run test:run      # Vitest (single run, CI-style)
npm run test:visual   # Playwright E2E (headed, auto-starts dev server)
npx vitest run path/to/file.test.ts           # Run a single vitest file
npx vitest run -t "test name"                 # Run tests matching a name
npx playwright test tests/e2e/login.spec.ts   # Run one E2E spec
```

Local Supabase (required for most flows — auth, ingest, transactions pages):

```bash
npx supabase start   # boots local stack (API :54321, DB :54322, Studio :54323, Inbucket :54324)
npx supabase db reset  # re-run all migrations from scratch
npx supabase stop
```

Env setup: copy `.env.example` → `.env.local`, fill in keys printed by `supabase start`.

## Architecture

Next.js 15 App Router + React 19 + Supabase (Postgres, SSR auth) + Tailwind v4 + Shadcn UI ("new-york" style, neutral base). Path alias `@/*` → repo root.

### Server/Client boundary

This project is **RSC-by-default**. Pages in `app/` are Server Components and fetch data directly via Server Actions in `app/actions/*` (e.g., `getTransactions`, `refreshTransactionData`, `getTags`). Client Components are pushed to leaves — see `components/transactions-view.tsx` receiving server-loaded data as initial props and using optimistic UI for mutations. Don't reach for `useEffect`-based data fetching; add a Server Action or load in the RSC.

**Cache invalidation rule:** every Server Action that mutates data must call `revalidatePath` for every page that reads that data. Client components calling mutations from outside the affected page must also call `router.refresh()` or navigate — otherwise the user sees stale UI until they reload.

### Supabase clients

Three distinct clients, pick the right one:
- `lib/supabase/server.ts` — RSC / Server Action client, reads cookies via `next/headers`. Use this in `app/**` server code.
- `lib/supabase/client.ts` — browser client (`supabase`) + a `createServerClient()` helper that uses `SUPABASE_SERVICE_ROLE_KEY` for admin operations in API route handlers (e.g., `app/api/statements/ingest`).
- `lib/supabase/middleware.ts` — used by `middleware.ts` to refresh the session on every request.

`middleware.ts` enforces auth: unauthenticated users are redirected to `/login` for any path except `/`, `/login`, `/auth`. Authenticated users hitting `/` or `/login` are redirected to `/upload`.

### Statement ingestion pipeline

The core domain flow — a PDF becomes rows in Postgres:

1. **Upload** — `components/upload-dropzone.tsx` posts a PDF to `POST /api/statements/ingest` (`app/api/statements/ingest/route.ts`, `runtime: "nodejs"`, 4 MB cap, bearer-token auth against the service-role client).
2. **Parse** — `lib/pdf/extract-tables.ts` drives `pdfjs-dist` and feeds word coords into `lib/pdf/parser.ts`. The parser is layout-aware (not regex-on-flat-text): it groups words by y/x, classifies column bands (Withdrawal/Deposit/Balance), and uses per-layout `StatementProfile`s from `lib/pdf/profiles.ts` (`generic`, `altitude_credit_card`, `dbs_deposit_investment`) selected by filename/heading heuristics. Rejected rows are first-class output (`lastRejections`) for audit. This is a TypeScript port of a larger Python parser — keep the rejection-logging contract when editing.
3. **Identifier** — `lib/transaction-identifier.ts` generates a deterministic per-transaction hash used for cross-statement dedup (unique index `transactions_user_identifier_idx`).
4. **Ingest** — `lib/db/ingest.ts` hashes the file (`source_file_sha256`), short-circuits duplicate uploads, creates a `statements` row, then stages rows in `transaction_imports` (a staging table separate from `transactions`).
5. **Review & confirm** — `app/imports/[statementId]/review/*` lets the user accept/reject staged rows; accepted rows are promoted into `transactions`.

Schema lives in `supabase/migrations/*.sql`. **Row Level Security must be enabled on every user-facing table** — this is the project's hard rule, not a style preference. Regenerated types live in `lib/supabase/database.types.ts`.

### Directory map (what lives where)

- `app/actions/` — Server Actions (`'use server'`), the primary data-mutation surface.
- `app/api/` — API route handlers (only for things that can't be a Server Action, like `multipart/form-data` uploads).
- `app/(dashboard)/upload`, `app/transactions`, `app/summary`, `app/statements/[id]`, `app/imports/[statementId]/review` — app pages (RSC).
- `components/ui/` — Shadcn components. Owned code — edit in place, don't re-install over customizations.
- `components/*.tsx` — feature components (auth-provider, nav-header, transaction-table, transactions-view, upload-dropzone, etc.).
- `lib/pdf/` — parser, profiles, section classifier, tests (`__tests__/`).
- `docs/specs/` — numbered specs are the source of truth for features; `docs/ROADMAP.md` for product direction.

## Non-negotiable rules (from `.agent/rules/stack-and-compliance.md`)

- **Stack**: Next.js App Router (RSC default), Shadcn UI (don't invent styles when a UI primitive exists), Tailwind utilities (**no arbitrary values** like `p-[16px]` — use `p-4`), `lucide-react` for icons only, Supabase SSR, RLS on every table.
- **Financial-advice compliance**: copy must be **descriptive, not prescriptive**. ✅ "Coffee spending increased 20%." ❌ "You spend too much on coffee." This applies to UI strings, insights, and any future AI output.
- **Privacy**: never log PII (transaction descriptions, statement contents, emails) to the console. The parser logs rejections by pattern, not raw rows.
- **Shadcn dialog/sheet props**: use `<Dialog open={isOpen} onOpenChange={setIsOpen}>` — not `onClose`/`isOpen`.

## Specs-first workflow

The `.agent/workflows/` directory defines `/new-feature`, `/build-feature`, and `/plan-change` flows. When adding or changing a feature, read the matching spec in `docs/specs/` first (they're the Definition of Done) and update `docs/progress-log.md` when finishing a feature.

## Testing notes

- **Vitest** covers unit tests — primarily `lib/pdf/__tests__/` (parser, line grouping, sanitization) and `lib/__tests__/transaction-identifier.test.ts`. Config at `vitest.config.ts` excludes `tests/**` so Playwright specs aren't picked up by vitest.
- **Playwright** config lives at `playwright.config.ts`. `webServer` runs `npm run dev` automatically. Specs are in `tests/e2e/`.
- Auth E2E bypass: `signInWithOtp` / `verifyOtp` in `app/actions/auth.ts` accept any `test-*@...` email with OTP `111111` when `NODE_ENV !== 'production'`. Use this for Playwright flows instead of hitting real magic links.
