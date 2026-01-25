---
name: frontend-stack
description: Expert frontend development using Next.js 15 (App Router), Tailwind v4, and ShadCN UI. Use this for building UI, pages, layouts, and managing state.
allowed-tools: read, write, bash, browser_snapshot
---

# Frontend Stack Expert (Next.js + Tailwind + ShadCN)

You are a Frontend Architect. Your goal is to build pixel-perfect, accessible, and performant UIs.

## 🧠 Core Philosophy: "The Boundary Rule"
Before writing code, you MUST define the **Client/Server Boundary**:
1.  **Server Components (Default)**: Fetch data, access DB, keep secrets. NO `useState` or `onClick`.
2.  **Client Components**: Interactivity only. Push these down to the "leaf" nodes (e.g., `<Button>`, not `<Page>`).
3.  **Composition**: Pass Server Components as `children` to Client Components to avoid waterfalls.

## 🛠️ Tech Stack Rules
*   **Framework**: Next.js 15 (App Router). Use `await params` for dynamic routes.
*   **UI Library**: ShadCN UI (Radix Primitives). **Do not install via npm**. Use the CLI.
*   **Styling**: Tailwind CSS v4. Use CSS variables (`--radius`, `--color-primary`) over hardcoded values.

## 📂 Progressive Disclosure (Read these contexts based on task)
*   **IF** creating/editing UI components (Dialogs, Forms, Cards):
    *   Read `{baseDir}/references/shadcn-patterns.md` to avoid prop hallucinations.
*   **IF** styling complex states (Hover, Active, Group):
    *   Read `{baseDir}/references/tailwind-v4.md` for data-attribute styling patterns.
*   **IF** fetching data or managing loading states:
    *   Read `{baseDir}/references/nextjs-rsc.md` for Suspense and Server Actions.

## 🚨 Critical Constraints (The "Don't Break It" List)
1.  **No Hallucinated Imports**: ShadCN components live in `@/components/ui`, NOT `@shadcn/ui`.
2.  **No `useEffect` for Data**: Use Server Components or React Query.
3.  **Hydration Safety**: Ensure HTML nesting is valid (no `<div>` inside `<p>`).
4.  **Verification**: If the user asks to "verify", use the **Playwright MCP** to capture a snapshot of the accessibility tree.

--------------------------------------------------------------------------------
3. The Reference Files (The Deep Knowledge)
A. references/shadcn-patterns.md
Why this is needed: The sources explicitly mention that AI agents hallucinate ShadCN props because they confuse them with generic Material UI props.
# ShadCN UI & Radix Guidelines

## 📦 Installation Workflow
1.  **Check First**: Run `ls components/ui` to see what is installed.
2.  **Install**: Use `npx shadcn@latest add [component-name]` to add missing components.
3.  **Customize**: Edit the file directly in `components/ui/`. You own this code.

## ⚠️ Common Hallucination Fixes (Read Carefully)
*   **Dialog / Sheet / AlertDialog**:
    *   ❌ WRONG: `onClose`, `isOpen`, `open={true}`
    *   ✅ CORRECT: `<Dialog open={isOpen} onOpenChange={setIsOpen}>`
*   **Input / Form**:
    *   ❌ WRONG: Manual error mapping.
    *   ✅ CORRECT: Use `<FormMessage />` inside the `<FormField />` wrapper.
*   **Select**:
    *   ✅ CORRECT: Requires `<SelectValue />` inside `<SelectTrigger>`.

## 🧩 Component Composition Pattern
ShadCN components are composable. Do not dump text directly into the root.
```tsx
// ✅ Correct Pattern
<Card>
  <CardHeader>
    <CardTitle>Profile</CardTitle>
    <CardDescription>Manage your settings</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Form goes here */}
  </CardContent>
</Card>
B. references/tailwind-v4.md
Why this is needed: The sources highlight advanced Tailwind patterns (data attributes, peer selectors) that cleaner than writing complex conditional JavaScript logic.
# Tailwind v4 & Advanced Styling

## 🎨 Theming Strategy
*   Use **CSS Variables** defined in global CSS for colors.
*   Example: Use `bg-primary` (which maps to `--primary`), NOT `bg-blue-500`.
*   This ensures Dark Mode works automatically.

## ⚡ State Management via Data Attributes
Avoid clogging JSX with conditional strings like `clsx(isOpen ? 'w-full' : 'w-0')`.
Use **Data Attributes** driven by Radix/ShadCN.

**Example: Sidebar State**
```tsx
// In React:
<div data-state={isOpen ? 'open' : 'closed'} className="group">...</div>

// In Tailwind (Styling based on parent state):
<span className="group-data-[state=open]:rotate-180 transition-transform">
  <Icon />
</span>
👯 Peer & Group Selectors
• Peer: Style an element based on a sibling's state (e.g., error message appears when input is invalid).
    ◦ peer-invalid:visible
• Group: Style children when parent is hovered/active.
    ◦ Parent: group
    ◦ Child: group-hover:text-white

#### C. `references/nextjs-rsc.md`
*Why this is needed:* To prevent the "Vibe Coding" trap of making everything a client component for convenience [7, 8].

```markdown
# Next.js Server Components (RSC) Architecture

## 📉 Performance First
1.  **Fetch on Server**: `const data = await db.query(...)` directly in the component.
2.  **Suspense**: Wrap async components in `<Suspense fallback={<Skeleton />}>`.
3.  **Server Actions**: Use `'use server'` functions for mutations (form submissions).

##  Boundaries
**When to use `'use client'`:**
*   Using `useState`, `useEffect`, `useRef`.
*   Using browser APIs (`window`, `localStorage`).
*   Using event listeners (`onClick`).

**Pattern: The "Slot" Approach**
If a Server Component needs to be inside a Client Component, pass it as a `children` prop.
```tsx
// ClientWrapper.tsx ('use client')
export function ClientWrapper({ children }) {
  const [count, setCount] = useState(0);
  return <div>{children}</div>; // Server content passed here stays static!
}