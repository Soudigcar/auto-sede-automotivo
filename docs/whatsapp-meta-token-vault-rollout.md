# Meta WhatsApp token Vault rollout

This rollout moves the Meta Cloud access token behind service-role-only RPCs without changing Evolution credentials or runtime behavior.

The Supabase Vault extension keeps its internal administrative grants for `service_role`; the Vault schema must remain outside the exposed Data API schemas. Application routes must use only the restricted RPCs and never query the Vault catalog directly. Reads remain dual during rollout, but writes fail closed until the Vault RPC exists and never copy a newly submitted token back into the plaintext column.

## Safe order

1. Apply the additive migration to the isolated Supabase development branch.
2. Verify that the migration creates the reference column and restricted RPCs without migrating existing rows.
3. Deploy the application branch to a Vercel Preview only. Credential writes remain unavailable there until the isolated migration rehearsal is separately authorized.
4. Validate the Master UI and unauthorized webhook responses without sending a WhatsApp message.
5. In a separately authorized production window, apply the same additive migration before deploying compatible application code.
6. Migrate each Meta row explicitly with `migrate_whatsapp_access_token_to_vault`; do not call it for Evolution rows.
7. After observation and token rotation, use a later migration to erase the temporary plaintext rollback copy.

## Rollback during the dual-read phase

The migration leaves the pre-existing legacy plaintext value unchanged and reads it only when no Vault reference exists. Newly submitted tokens are written only to Vault. To roll back a migrated Meta row, first restore application code that reads the legacy column, then clear that row's `access_token_secret_id`. Do not delete or alter Evolution rows. Keep the Vault secret until the application rollback is confirmed.

## Production stop conditions

- The target project or Vercel environment cannot be identified unambiguously.
- Any Evolution row would be modified.
- The Vault extension or expected RPC permissions differ from development.
- Row counts, WhatsApp connection state, or existing token-presence counts change during schema-only preflight.
- The Preview points at a production database for a mutating test.
