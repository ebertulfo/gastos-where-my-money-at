# Gastos Color Palette

_Last updated: 2025-11-25_

Gastos uses a minimalist, dark-mode-first color system with a neutral grey base and emerald as the primary accent.

This document defines:

- Semantic color roles (background, foreground, primary, etc.)
- Concrete hex values for dark and light themes
- Tailwind / CSS variable mapping (compatible with shadcn)

---

## 1. Semantic Color Roles

We follow (and extend) the shadcn convention:

- `background`, `foreground`
- `muted`, `muted-foreground`
- `card`, `card-foreground`
- `border`, `input`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `accent`, `accent-foreground`
- `destructive`, `destructive-foreground`
- `ring`

We also define a few custom roles:

- `subtle-bg` – for slightly raised surfaces (e.g., chat bubbles)
- `elevated-bg` – for sheets/modals
- `success` – success labels and toasts
- `warning` – subtle warning states
- `info` – informational highlights (if needed later)

---

## 2. Dark Theme (Primary)

Dark mode is the primary design mode. All design and implementation decisions should start here.

### 2.1 Dark Theme Color Values (Hex)

| Token                         | Hex      | Usage                                      |
| ----------------------------- | -------- | ------------------------------------------ |
| `background`                  | #050509  | App background (global)                    |
| `subtle-bg` (custom)          | #090912  | Slightly raised background (panels, list)  |
| `elevated-bg` (custom)        | #0F1018  | Modals, sheets, floating surfaces          |
| `foreground`                  | #F9FAFB  | Primary text                               |
| `muted`                       | #111827  | Muted backgrounds (tags, chips)            |
| `muted-foreground`            | #9CA3AF  | Secondary text                             |
| `card`                        | #050509  | Card background (may equal background)     |
| `card-foreground`             | #F9FAFB  | Card text                                  |
| `border`                      | #1F2933  | Borders and dividers                       |
| `input`                       | #111827  | Input background                           |
| `primary`                     | #10B981  | Emerald accent (buttons, links)            |
| `primary-foreground`          | #022C22  | Text/icon on primary                       |
| `secondary`                   | #111827  | Secondary buttons, subtle surfaces         |
| `secondary-foreground`        | #E5E7EB  | Text on secondary                          |
| `accent`                      | #34D399  | Hover, highlights, subtle accents          |
| `accent-foreground`           | #022C22  | Text on accent                             |
| `destructive`                 | #EF4444  | Destructive actions                        |
| `destructive-foreground`      | #FEF2F2  | Text on destructive                        |
| `success` (custom)            | #22C55E  | Explicit success states                    |
| `warning` (custom)            | #FBBF24  | Warning states                             |
| `info` (custom)               | #38BDF8  | Informational highlights                    |
| `ring`                        | #10B981  | Focus ring                                 |

**Note:** Values are intentionally close to Tailwind’s `slate`/`gray` + `emerald` palette to ease mental mapping.

---

## 3. Light Theme (Secondary)

Light theme exists for users who prefer it, but is not the primary design focus.

### 3.1 Light Theme Color Values (Hex)

| Token                         | Hex      | Usage                                      |
| ----------------------------- | -------- | ------------------------------------------ |
| `background`                  | #F9FAFB  | App background                             |
| `subtle-bg` (custom)          | #FFFFFF  | Panels, list items                         |
| `elevated-bg` (custom)        | #FFFFFF  | Cards, modals                              |
| `foreground`                  | #020617  | Primary text                               |
| `muted`                       | #E5E7EB  | Muted backgrounds                          |
| `muted-foreground`            | #6B7280  | Secondary text                             |
| `card`                        | #FFFFFF  | Card background                            |
| `card-foreground`             | #020617  | Card text                                  |
| `border`                      | #D1D5DB  | Borders and dividers                       |
| `input`                       | #FFFFFF  | Input background                           |
| `primary`                     | #059669  | Primary emerald                            |
| `primary-foreground`          | #ECFDF5  | Text/icon on primary                       |
| `secondary`                   | #E5E7EB  | Secondary surfaces                         |
| `secondary-foreground`        | #111827  | Text on secondary                          |
| `accent`                      | #10B981  | Hover/accents                              |
| `accent-foreground`           | #022C22  | Text on accent                             |
| `destructive`                 | #DC2626  | Destructive actions                        |
| `destructive-foreground`      | #FEF2F2  | Text on destructive                        |
| `success` (custom)            | #16A34A  | Success states                             |
| `warning` (custom)            | #D97706  | Warning states                             |
| `info` (custom)               | #0284C7  | Informational highlights                    |
| `ring`                        | #059669  | Focus ring                                 |

---

## 4. CSS Variable Mapping (shadcn / Tailwind Compatible)

We follow shadcn’s theme convention using CSS variables, and map them to the color tokens above.

### 4.1 Root Variables Example

```css
:root {
  /* Light theme (default) */
  --background: 249 250 251;
  --foreground: 2 6 23;

  --card: 255 255 255;
  --card-foreground: 2 6 23;

  --popover: 255 255 255;
  --popover-foreground: 2 6 23;

  --primary: 5 150 105;
  --primary-foreground: 236 253 245;

  --secondary: 229 231 235;
  --secondary-foreground: 17 24 39;

  --muted: 229 231 235;
  --muted-foreground: 107 114 128;

  --accent: 16 185 129;
  --accent-foreground: 2 44 34;

  --destructive: 220 38 38;
  --destructive-foreground: 254 242 242;

  --border: 209 213 219;
  --input: 255 255 255;
  --ring: 5 150 105;

  /* Custom tokens */
  --subtle-bg: 255 255 255;
  --elevated-bg: 255 255 255;
  --success: 22 163 74;
  --warning: 217 119 6;
  --info: 2 132 199;
}

4.2 Dark Theme Variables Example

.dark {
  --background: 5 5 9;
  --foreground: 249 250 251;

  --card: 5 5 9;
  --card-foreground: 249 250 251;

  --popover: 15 16 24;
  --popover-foreground: 249 250 251;

  --primary: 16 185 129;
  --primary-foreground: 2 44 34;

  --secondary: 17 24 39;
  --secondary-foreground: 229 231 235;

  --muted: 17 24 39;
  --muted-foreground: 156 163 175;

  --accent: 52 211 153;
  --accent-foreground: 2 44 34;

  --destructive: 239 68 68;
  --destructive-foreground: 254 242 242;

  --border: 31 41 51;
  --input: 17 24 39;
  --ring: 16 185 129;

  /* Custom tokens */
  --subtle-bg: 9 9 18;
  --elevated-bg: 15 16 24;
  --success: 34 197 94;
  --warning: 251 191 36;
  --info: 56 189 248;
}

Note: Values are in r g b format for direct Tailwind rgb(var(--background)) usage.

⸻

5. Tailwind Usage Example

// tailwind.config.ts (excerpt)
export const theme = {
  extend: {
    colors: {
      background: "rgb(var(--background) / <alpha-value>)",
      foreground: "rgb(var(--foreground) / <alpha-value>)",
      primary: "rgb(var(--primary) / <alpha-value>)",
      "primary-foreground": "rgb(var(--primary-foreground) / <alpha-value>)",
      border: "rgb(var(--border) / <alpha-value>)",
      muted: "rgb(var(--muted) / <alpha-value>)",
      "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
      accent: "rgb(var(--accent) / <alpha-value>)",
      "accent-foreground": "rgb(var(--accent-foreground) / <alpha-value>)",
      destructive: "rgb(var(--destructive) / <alpha-value>)",
      "destructive-foreground": "rgb(var(--destructive-foreground) / <alpha-value>)",
      success: "rgb(var(--success) / <alpha-value>)",
      warning: "rgb(var(--warning) / <alpha-value>)",
      info: "rgb(var(--info) / <alpha-value>)",
      "subtle-bg": "rgb(var(--subtle-bg) / <alpha-value>)",
      "elevated-bg": "rgb(var(--elevated-bg) / <alpha-value>)",
    },
  },
};


⸻

6. Usage Guidelines
	1.	Primary usage:
	•	Use primary for main CTAs like “Log expense”, “Save”, “Upgrade”.
	•	Avoid using primary for non-critical actions.
	2.	Secondary usage:
	•	Use secondary for less important actions or for ghost/outline style buttons.
	3.	Accent usage:
	•	Use accent for hover states, selection outlines, or small highlights (chips, tags).
	4.	Error & warning:
	•	Reserve destructive for deletions and irreversible actions.
	•	Use warning for “are you sure?” or limit-related warnings.
	5.	Background hierarchy:
	•	background for app shell.
	•	subtle-bg for chat area and panels.
	•	elevated-bg for modals, sheets, side drawers.

Keep emerald usage controlled. When in doubt: prefer neutral grey, and only bring in emerald to communicate action, status, or focus.