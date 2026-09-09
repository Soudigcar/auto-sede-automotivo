# Vehicle URL import correction

Baseline: 2fa327e180e98bb82dbf98e1b49aefcc3bd0b3e0.
Scope: stock URL imports, Master and Store. No schema migration.

## Behavior

- Parse HTML with parse5 (pinned 7.3.0); do not execute page scripts.
- Exclude related/financial DOM content before field extraction. Require a unique
  target heading/container, or an exact matching structured vehicle entity.
- Reject foreign or conflicting target prices; never rank odometers by magnitude.
- Preserve `metadata.source_description` separately from `optimized_description`.
  The existing editor displays source text by default; no layout changes.
- Persist per-field provenance and a content hash under `metadata.import_evidence`.
- Explicit evidence resolves stale parser values. AI cannot fill missing price/KM.
- Saving a draft confirms its submitted fields. Reimport retains those server-side
  values, including deliberate empty fields. Legacy saved drafts are protected too.
- Repeat content reuses its reviewed draft/images. Compare-and-set updates avoid
  overwriting a concurrent edit. Reimport of published vehicles is rejected; manual
  review/update remains the separate existing publication path.
- Preview diagnostics omit descriptions, credentials and arbitrary URLs; a hash
  identifies the target for correlation.

## Validation boundaries

Tests use the sanitized HTML fixture, simulated AI/image services and an in-memory
Supabase facade. Route tests execute the actual stock POST implementation with these
boundaries injected. No real import, provider call, storage upload or database write.
No PR, merge, production release or migration is authorized by this change.

## Compatibility

Unidentified/ambiguous pages fail closed instead of falling back to whole-page
numbers. Additional site layouts may need explicit adapters or manual entry. JSON
hydration must be valid application/json with an exact vehicle URL; arbitrary
JavaScript assignments are not executed or interpreted. The alternate site-import
route retains source evidence and manual-confirmation metadata as well.

## Validation results (2026-09-09)

- Full test suite: 627 passed, zero failures (including 30 new focused cases).
- ESLint: passed with zero warnings.
- Next.js production build and TypeScript: passed with synthetic configuration,
  a local empty Supabase REST GET mock, and external network blocked.
- `npm audit --audit-level=high`: fails on four pre-existing dependency advisories
  (three high, one critical). The exact main lockfile reports the same four.
  Dependency upgrades are outside this correction.
- No real AI call, vehicle import, database mutation or storage upload was used
  in validation. No UI/layout files were changed.

## Isolated visual validation

`/validacao-importador` is a standalone, Preview-only HTML GET route. It runs
the pure extractor against the saved fixture; it does not load the CRM layout,
AI adapter, database clients, image uploader, or external assets. A restrictive
CSP blocks scripts, connections, images and forms. No save/publish actions exist.
Production returns 404. Optimized description is explicitly not generated.
Validation after adding this screen: 628 tests passed, ESLint and build passed
with offline mocks. The fixture is included in the route deployment trace.
