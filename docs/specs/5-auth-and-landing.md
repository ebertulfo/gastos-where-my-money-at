# Authentication & Onboarding — Spec (v0.1)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2026-01-17 | antigravity | Initial draft covering Auth (Email+OTP), Landing Page, and Onboarding integration |

## Objective

Securely onboard users via Supabase Authentication (Email + OTP) and direct them through a structured "First Run" experience. Shift accessibility models from "Public Upload" to "Private Workspace".

## Scope

- **Auth:** Switch to Supabase Auth (Email + OTP).
- **Public:** New Landing Page at `/`.
- **Protected:** Move Dashboard to `/upload` (protected).
- **Flow:** Landing -> Login -> Onboarding (if new) -> Dashboard.

## 1. Authentication

### Requirement
- **Method**: Email + OTP (6-digit code).
- **Persistence**: Session managed via Supabase SSR cookies.
- **Security**: RLS enabled on all tables (Data isolation per `user_id`).

### Supabase Configuration
The following settings must be applied in the Supabase Dashboard:

1.  **Authentication > Providers > Email**:
    - `Enable Email Provider`: **ON**
    - `Confirm Email`: **OFF** (Simplifies flow for MVP)
    - `Secure Password Change`: **OFF** (Not using passwords)
    - `Email OTP Length`: **6**
2.  **Authentication > URL Configuration**:
    - `Site URL`: `http://localhost:3000` (Update for prod)

## 2. Routing & Architecture

### Page Structure

| Route | Access | Purpose |
| :--- | :--- | :--- |
| `/` | Public | **Landing Page**. Marketing copy + "Get Started" button. |
| `/login` | Public | **Login/Register**. Email input -> OTP input -> Redirect. |
| `/upload` | Protected | **Dashboard** (formerly `/`). Main app interface. |
| `/auth/callback` | Public | Handles API-side auth exchange (standard Supabase flow). |

### Middleware
- Create `middleware.ts` to strictly enforce:
    - If Unauthenticated AND accessing Protected Route -> Redirect to `/login`.
    - If Authenticated AND accessing `/login` or `/` -> Redirect to `/upload`.

## 3. Onboarding Logic

### Modification
- **Current**: `page.tsx` checks settings client-side and opens Modal.
- **New**: 
    - Keep the `OnboardingWizard` component (it is well implemented).
    - `page.tsx` (now at `/upload/page.tsx`) continues to trigger it if user settings are missing.
    - **Enhancement**: Improve the "Success" step of Onboarding to explicitly mention "You are now ready to upload".

## 4. Implementation Plan

### Dependencies
- `@supabase/ssr` (Available)
- `@supabase/supabase-js` (Available)

### Files

#### [NEW] `app/login/page.tsx`
- **UI**: Centered card.
- **State**: `email` (string), `otp` (string), `step` ('email' | 'otp').
- **Action**: `signInWithOtp({ email })`, `verifyOtp({ email, token })`.

#### [NEW] `app/auth/callback/route.ts`
- Standard PKCE exchange code.

#### [MODIFY] `app/page.tsx`
- **Action**: Rename/Move to `app/(dashboard)/upload/page.tsx`.
- **Content**: Replace `app/page.tsx` with Landing Page content (Hero section, "Get Started" button linking to `/login`).

#### [NEW] `middleware.ts`
- Implement `updateSession` from Supabase SSR docs to manage cookies and redirects.

#### [MODIFY] `components/nav-header.tsx`
- Add "Logout" button.
- Show user email (optional).

## Verification Plan

### Automated Tests
- None planned for this MVP phase.

### Manual Verification
1.  **Auth Flow**:
    - Go to `/`. Click "Get Started".
    - Enter Email. Check Inbox.
    - Enter OTP.
    - Verify redirect to `/upload` (or Onboarding if new).
2.  **Protection**:
    - Try accessing `/upload` in Incognito. Verify redirect to `/login`.
3.  **Onboarding**:
    - Create a fresh account.
    - Verify `OnboardingWizard` pops up.
    - Complete it.
    - Refresh. Verify Wizard does not appear again.
