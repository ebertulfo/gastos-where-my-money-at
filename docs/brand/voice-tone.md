---

## `design/brand/voice-tone.md`

```markdown
# Gastos Voice & Tone Guidelines

_Last updated: 2025-11-25_

Gastos’ voice should feel calm, clear, and respectful.  
The product deals with money and personal habits — topics that can easily trigger anxiety or shame — so language must be helpful, not judgmental.

---

## 1. Core Voice Attributes

Gastos voice is:

- **Calm** – no panic, no drama.
- **Clear** – simple words over jargon.
- **Supportive** – we help, we don’t judge.
- **Confident** – we seem reliable and steady.
- **Low-friction** – short messages, no walls of text.

Gastos voice is **not**:

- Sarcastic  
- Overly playful or “meme-y”  
- Over-hyped (“OMG, your finances are insane!”)  
- Guilt-driven (“You’re spending too much, seriously…”)  

---

## 2. Person Perspective & Style

- Use **second person**: “you”, “your spending”.
- Avoid corporate “we” unless it’s clearly Gastos speaking as a product (“We’ve categorized your expense.”).
- Use contractions: “you’ve”, “you’re”, “we’ll”.

**Example:**

- ✅ “You’ve logged 3 expenses today.”  
- ❌ “The user has logged 3 expenses today.”  

---

## 3. Tone by Context

### 3.1 Default (Most Screens, Normal State)

- Tone: calm, neutral, slightly warm.
- Goal: reduce friction, keep users focused on action.

Examples:

- “What did you spend on?”  
- “Add a short note (optional).”  
- “All set. Your expense is saved.”

### 3.2 Error States

- Tone: direct, helpful, non-dramatic.
- Clearly say what went wrong and what to do next.

Examples:

- ✅ “I couldn’t read that receipt clearly. Try another photo or type the amount instead.”  
- ✅ “Something went wrong while saving. Try again in a moment.”  
- ❌ “Error! The system encountered an internal fault.”  
- ❌ “Invalid input.”

### 3.3 AI Misunderstanding / Low Confidence

- Admit uncertainty.
- Offer an easy correction path.

Examples:

- “Here’s what I understood from your photo. Does this look right?”  
- “I’m not fully sure about the amount. Can you confirm it?”  

### 3.4 Limits / Paywall

- Tone: honest, friendly, no pressure.
- Focus on value, not fear.

Examples:

- “You’ve used your 10 free photo scans this month. Upgrade to continue scanning receipts without limits.”  
- “You’re at today’s free scan limit. You can still log expenses by text or audio.”  

Avoid:

- “Upgrade now or lose your data!”  
- “Your free plan is too limited for your usage.”

### 3.5 Success / Confirmation

- Tone: simple, satisfying, no fireworks.

Examples:

- “Logged.”  
- “Saved to your expenses.”  
- “All set. This expense is in your history.”

Keep it short and calm. No confetti.

---

## 4. Dos and Don’ts

### 4.1 Wording

| Do                                       | Don’t                                       |
| ---------------------------------------- | ------------------------------------------- |
| “Log an expense”                         | “Create a spending record entity”           |
| “Today’s total”                          | “Aggregated debit transactions (current)”   |
| “You’re all caught up.”                  | “No records found for the given query.”     |
| “Try again in a moment.”                 | “Transaction failed, please retry later.”   |
| “You can fix this in a few taps.”        | “User action required to fix this error.”   |

### 4.2 Length

- Prefer **short sentences** and **short paragraphs**.
- Avoid more than 2 lines for inline messages.
- For tooltips or helper text, aim for 1 sentence.

---

## 5. Microcopy Guidelines

### 5.1 Buttons

- Use verbs that describe the action clearly:
  - “Log expense”
  - “Save”
  - “Edit”
  - “Try again”
  - “Upgrade”
- Avoid vague labels:
  - “Submit”
  - “Process”
  - “Execute”

### 5.2 Placeholders

Use placeholders to guide, not to be cute.

- ✅ “e.g. Lunch at Tacos Bar”  
- ✅ “Optional note about this expense”  
- ❌ “Tell me everything 😉”  

### 5.3 Empty States

Keep empty states encouraging, not shaming.

Examples:

- “No expenses yet. Log your first one to see your spending here.”  
- “You haven’t logged anything today. Snap a photo or type an expense to get started.”

Avoid:

- “Looks like you’re not tracking your money.”  
- “Still nothing. Start being responsible with your finances.”

---

## 6. AI Voice Specifically

AI replies should be:

- Short and to the point.
- Action-oriented (offer next steps).
- Confident but not absolute (allow for corrections).

Examples:

- “I’ve categorized this as Food & Drinks. Want to change it?”  
- “This looks like a transport expense. I set it as Transport.”

Avoid:

- “I’m 89% confident this is categorized correctly.” (too technical)
- “I’m completely sure about this.” (too rigid; may be wrong)

---

## 7. Localization Considerations (Future)

When localizing:

- Keep the **tone** consistent: calm, clear, respectful.
- Avoid idioms that don’t translate well.
- Money is culturally sensitive; no shaming language anywhere.

---

## 8. Quick Reference Checklist

Before shipping any new UI text, check:

- [ ] Is it clear on first read?  
- [ ] Is it short and simple?  
- [ ] Is the tone calm and respectful?  
- [ ] Does it avoid guilt and shame?  
- [ ] Does it give the user a clear next step?  

If any answer is “no”, revise the copy before shipping.