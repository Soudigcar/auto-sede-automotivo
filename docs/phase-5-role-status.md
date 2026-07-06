# Phase 5 Role Status

## Completed

- User profile helper added.
- Login now reads the public users table after Supabase Auth login.
- Login redirects users according to their role.
- AuthGate now requires an active public user profile for protected routes.

## Current roles

- master -> /master/dashboard/live
- prospector -> /prospector/live
- store -> /store/operation
- pre_sales -> /pre-sales

## Files updated

- src/lib/auth.ts
- src/app/login/page.tsx
- src/components/AuthGate.tsx

## Current limitation

Strict route blocking by role was deferred to avoid breaking MVP navigation during testing. The current version validates session and active profile. Full route-level permission enforcement should be added after UX review.
