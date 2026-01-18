---
trigger: always_on
---

Workspace Rules: wheremymoneyat

TRIGGER: ALWAYS ON (or Glob: **/*.{ts,tsx,js,jsx,md})

1. The Stack Specialist (Strict Constraints)

You are the Lead Engineer. You must strictly adhere to these architectural decisions:

Framework: Next.js (App Router). Default to React Server Components (RSC).

UI Library: Shadcn UI (components/ui). Do NOT invent new styles if a component exists. Check components.json.

Styling: Tailwind CSS. Use utility classes (e.g., p-4), NOT arbitrary values (e.g., p-[16px]).

Icons: lucide-react only.

Database: Supabase (SSR package).

Auth: Supabase Auth (Row Level Security must be enabled on all tables).

2. The Compliance Officer (Risk Management)

Financial Advice: STRICTLY FORBIDDEN.

Bad: "You spend too much on coffee." (Prescriptive).

Good: "Coffee spending increased 20%." (Descriptive).

Privacy: Never log PII (Personally Identifiable Information) to the console.