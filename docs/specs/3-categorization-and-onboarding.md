# Categorization, Payments & Onboarding — Spec (v0.1)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2025-12-08 | ebertulfo | Initial draft covering Categories, Payment flag, and Onboarding flow |

## Objective

Improve transaction management by identifying "Expenses" vs "Payments" (Credit Card) and introducing user-defined categories. Additionally, introduce an Onboarding Flow to help new users set up their categories effortlessly.

## Scope

- **Schema:** New `categories` table and updates to `transactions` (`category_id`, `is_payment`).
- **UI:** Updates to Transaction Table for assigning categories and marking payments.
- **Onboarding:** A "First Run" experience to populate default categories.
- **Logic:** "Total Spend" calculation updates to exclude payments.

## 1. Categorization

### Requirement
- Users must be able to categorize transactions (e.g., Food, Transport, Utilities).
- Users must have their own list of categories (customizable).
- Transactions can have **one** category assigned.

### Schema Changes

#### New Table: `categories`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid | Primary Key |
| `user_id` | uuid | FK to `auth.users` |
| `name` | text | Unique per user |
| `created_at` | timestamptz | Default now() |

#### Update Table: `transactions`
- Add `category_id` (uuid, nullable, FK to `categories.id`)

### UI Implication
- **Categories Page**: Allow adding, editing, and deleting categories.
- **Transaction Table**: Dropdown/Combobox in the row to assign a category.

## 2. Transaction Exclusion

### Requirement
- Certain transactions (payments, duplicates, transfers) should not be counted in the "Total Spend".
- Users need to be able to mark these explicitly.
- We generalized `is_payment` to `is_excluded` to cover all these cases.

### Schema Changes

#### Update Table: `transactions`
- Add `is_excluded` (boolean, default false) - *Renamed from `is_payment`*
- Add `exclusion_reason` (text, nullable) - *Optional context*

### UI Implication
- **Transaction Table**: "Eye/Eye-Off" toggle button.
- **Reason Input**: When excluding, a popover prompts for an optional reason (e.g., "Duplicate").
- **Visuals**: Excluded rows are dimmed and strikethrough.
- **Dashboard**: "Total Spend" filters out transactions where `is_excluded = true`.

## 3. Onboarding Flow

### Requirement
- When a user accesses the app for the first time (or has no categories), prompt them to set up.
- Reduce friction by offering "Default Categories".

### Logic
- **Trigger**: App Layout checks `categories` count for the current user.
- **Condition**: If `count === 0`, Trigger Onboarding Modal.

### UI Flow
1. **Welcome Modal**: "Welcome to Gastos! Let's get you set up."
2. **Category Setup**: 
    - "Do you have existing categories?" (Yes/No)
    - **No**: "Here are some defaults we recommend: [Food, Transport, Utilities, Shopping...]" -> Button: "Use Defaults".
    - **Yes**: Allow typing/adding their own list manually.
3. **Completion**: "You're all set! Now go verify your transactions."

## 4. Workflows & Interactions

### Excluding a Transaction
1. User sees a transaction (e.g., "DBS Payment" or "Transfer").
2. User clicks "Exclude" (Eye-Off icon).
3. (Optional) User enters a reason in the popover.
4. UI updates `is_excluded = true`.
5. "Total Spend" recalculates (subtracting that amount).

### Assigning a Category
1. User sees "Grab Transport".
2. User clicks Category Dropdown.
3. Selects "Transport".
4. Database updates `category_id`.
