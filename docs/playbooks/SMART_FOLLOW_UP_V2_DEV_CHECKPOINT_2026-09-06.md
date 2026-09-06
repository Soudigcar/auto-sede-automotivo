# Smart Follow-up V2 — controlled DEV checkpoint

Status: **NOT_READY_FOR_CANARY**. This branch is preparation for review and synthetic homologation; it does not authorize LIVE.

## Scope

- Base main: `1a7c5ff0b5bb2c27086fe0dd6c98009b863906b2` (PR #212 changed pipeline UI only).
- Branch: `fix/autocar-follow-up-v2-controlled`.
- Only database receiving migrations/tests: autocar-dev `azszzdotbrczlhrmhrlw`.
- No writes to CRM Production `wufikrdgyxrsszlbpfmv` or AUTOCAR Production `icmwdggbvijexjgrvsbl`.
- V1 unchanged: Preview dry-run only. No Evolution/WhatsApp calls during this work.

## Implementation

V2 owns its execution ledger, independently of V1 leases. Operational candidates use official scenario offsets and verified appointment/callback sources. Existing V1 callback facts are read without modifying the V1 queue. Reopening messages cannot create a new sequence from their own outbound message.

Every execution checks Master, selected/effective mode, human protection, policies, configuration, conversation, sale, inbound anchor, source, time window and SAFE CORE before generation and again afterwards. LIVE requires the exact A4 ID and exact Production destinations plus `AUTOCAR_FOLLOW_UP_V2_LIVE_A4_ENABLED=true` (not configured by this task). DEV/Preview ports do not provide a send function.

Database functions reserve quota under a lock shared by all conversations of a lead, fence each worker with a fresh lease token, and preserve dispatch uncertainty instead of blindly retrying. Terminal execution states cannot be reclaimed. Audit access is service-only, with RLS and public function execution revoked.

The homologation endpoint additionally requires the exact Preview branch, a dedicated secret and enable flag. It accepts only marked synthetic DEV executions and checks actual client destinations before queries. A same-origin POST form supports authenticated browser operation without secrets in URLs or responses. The temporary enable flag and secret were configured for this branch, then removed after the browser security policy blocked reading the isolation response. Homologation remains disabled.

## Applied in DEV

- `20260906153138_autocar_follow_up_v2_controlled_execution.sql`
- `20260906154137_autocar_follow_up_v2_pre_dispatch_guards.sql`
- `20260906155534_autocar_follow_up_v2_atomic_runtime_claim.sql`

No Production migration is authorized. These migrations do not enable policies, stores or cron jobs.

## Verified

- 588 local tests passed, including 68 new behavioral tests using simulated services.
- Typecheck and lint passed.
- Real PostgreSQL assertions: unique planning, duplicate worker rejection, lease expiration/reclaim, old worker fencing, daily reservation, cooldown, sequence limit, superseded, audit and cleanup.
- Two concurrent tool requests against the same synthetic event: one lease acquired, one `duplicate_or_leased`.
- Security advisors after migrations: no findings.
- SQL fixtures removed: zero execution/audit/reference remnants.
- Original DEV baseline: 5 stores, 247 historical runtime claims, 1 store reference, 0 V1 events and 0 follow-up execution records.

## Still required before readiness

1. Resolve the browser URL policy block through a supported user/platform workflow. Do not retry the blocked endpoint through alternate tools or routes to circumvent this policy.
2. Recreate temporary homologation authentication only when the supported workflow is available, then verify Preview isolation with real clients and the exact deployed commit.
3. Run all requested scenarios through the Preview using synthetic CRM/runtime records and real model generation, then remove them.
4. Review the new database adapter against integrated data, including event sourcing, original LIVE observability and persistence reconciliation. Simulated tests are not evidence that these integrations have passed.
5. Only after integrated tests pass, audit A4 readiness read-only and propose final canary configuration for separate authorization.

Current official settings from the preceding read-only audit: global disabled/off, 01:00–23:00, 2 per lead/day, 4 per sequence, 7 days, 30-minute minimum; A4 enabled/off, 01:00–19:00, 1 per lead/day, 3 per sequence, 7 days, 60-minute minimum; global create_follow_up deny, no A4 allow policy. No values changed in Production.

## Authenticated browser continuation and postflight

- Supabase sign-in completed. The existing service-role credential was verified in memory as belonging to DEV ref `azszzdotbrczlhrmhrlw`; no credential value was emitted.
- Saved only branch-specific Preview overrides for `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTOCAR_DEV_SUPABASE_URL`, `AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY`, `AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED=true`, and `AUTOCAR_FOLLOW_UP_V2_LIVE_A4_ENABLED=false`.
- Existing `OPENAI_API_KEY` and `OPENAI_MODEL` are scoped to Production and Preview; preserved. `CRON_SECRET` is Production-only; preserved. The isolated test endpoint uses its own temporary authentication.
- Runtime code head: `5c928e92995920795688d8d88ee23c98fb7cc41b`; CI run `34046703608` passed. No PR or merge created.
- Isolation POST submitted to temporary Preview `dpl_9ADpvSxV4929qRC8sXGHzrEH4ows`. Reading its response was rejected by the cloud browser URL security policy. Isolation success is therefore unverified; no synthetic scenario execution was started.
- Removed both temporary homologation environment variables and deleted the two deployments carrying them: `dpl_9ADpvSxV4929qRC8sXGHzrEH4ows` and `dpl_3apZPgpm9hTEpKzBQSFjx6W872Sh`. Deployment listing confirmed zero remaining instances of those IDs.
- Replacement Preview `dpl_5yx4Pp14ZhrxNVvpdgS11t5aMVuE`: READY, same runtime head, target Preview, no homologation enable flag or authentication secret. No bypass token was created.
- DEV postflight: 5 stores, 247 historical claims, 0 synthetic stores, 0 synthetic V2 executions and 0 V2 audit rows. No new database writes during this continuation.
- CRM and AUTOCAR Production: ACTIVE_HEALTHY in read-only metadata checks. Vercel Production `dpl_6NAp1Qn4zZ68na7zVEW2vpGzd2da` remains READY at main `1a7c5ff0b5bb2c27086fe0dd6c98009b863906b2`.
- Result remains NOT_READY_FOR_CANARY. Integrated model generation and the requested scenario matrix are pending. No LIVE authorization is proposed.
