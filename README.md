# Gastos - Where My Money At? 💸

A privacy-first expense tracking tool that helps you consolidate bank and credit card statements to understand where your money goes.

## 🔒 Privacy First

**All transaction parsing happens entirely in your browser.** Your financial statements never leave your device - no data is uploaded to any server. This is the core principle of this application.

## ✨ Features

- **PDF Statement Parsing**: Upload bank statements and credit card statements in PDF format
- **Automatic Transaction Extraction**: Extracts dates, descriptions, and amounts from your statements
- **Smart Withdrawal Detection**: Uses balance comparison to accurately identify expenses vs income
- **Multi-Account Support**: Handles PDFs with multiple account sections
- **Duplicate Detection**: Each transaction gets a unique identifier for deduplication across imports

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Docker Desktop (for local Supabase)

### Installation

```bash
# Clone the repository
git clone https://github.com/ebertulfo/gastos-where-my-money-at.git
cd gastos-where-my-money-at

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start local Supabase (requires Docker)
npx supabase start

# The command above will output your local API URL and keys
# Update .env.local with the values shown

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Local Supabase Commands

```bash
# Start Supabase services
npx supabase start

# Reset database (apply all migrations fresh)
npx supabase db reset

# View local Supabase dashboard
# http://127.0.0.1:54323

# Stop Supabase when done
npx supabase stop
```

### Usage

1. **Upload a Statement**: Drag and drop or click to upload a PDF bank/credit card statement
2. **Review Extracted Transactions**: The app will parse and display all detected transactions
3. **Export or Organize**: Use the extracted data to track your expenses

## 🗺️ Roadmap

### Phase 1: Statement Parsing ✅
- [x] PDF text extraction
- [x] Bank statement transaction parsing
- [x] Credit card statement parsing
- [x] Multi-line transaction handling
- [x] Balance-based withdrawal/deposit detection

### Phase 2: Transaction Management (Planned)
- [ ] Transaction identifier generation for deduplication
- [ ] Local storage persistence (IndexedDB)
- [ ] Import/export functionality
- [ ] Duplicate detection on import

### Phase 3: Organization & Insights (Planned)
- [ ] Transaction categorization
- [ ] Custom category creation
- [ ] Monthly/yearly spending summaries
- [ ] Spending trends and charts
- [ ] Search and filter transactions

### Phase 4: Multi-Statement Consolidation (Planned)
- [ ] Merge transactions from multiple statements
- [ ] Cross-account expense tracking
- [ ] Statement period management
- [ ] Account management

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Language**: TypeScript
- **Database**: [Supabase](https://supabase.com/) (Postgres)
- **PDF Parsing**: pdf-parse (runs in Node.js runtime, but data stays local)
- **Styling**: Tailwind CSS

## 📄 Supported Statement Formats

Currently tested with:
- DBS/POSB Bank Statements (Singapore)
- DBS Credit Card Statements (Singapore)

More formats will be added based on user feedback.

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

**Remember**: Your financial data is yours. This tool is designed to help you understand your spending without compromising your privacy.

