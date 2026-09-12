import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  hasMetaWhatsappAccessToken,
  isEvolutionWhatsappNumber,
  resolveMetaWhatsappAccessToken
} from '../src/lib/server/whatsappMetaCredentials.ts';

const migration = readFileSync('supabase/migrations/20260901163000_whatsapp_meta_access_token_vault.sql', 'utf8');
const masterRoute = readFileSync('src/app/api/master/integrations/whatsapp/route.ts', 'utf8');
const masterPage = readFileSync('src/app/master/integrations/whatsapp/page.tsx', 'utf8');
const metaWebhook = readFileSync('src/app/api/webhooks/whatsapp/route.ts', 'utf8');
const evolutionWebhook = readFileSync('src/app/api/webhooks/evolution/route.ts', 'utf8');
const managedEvolution = readFileSync('src/lib/server/managedWhatsappEvolution.ts', 'utf8');
const sendRoute = readFileSync('src/app/api/whatsapp/messages/send/route.ts', 'utf8');
const sendMediaRoute = readFileSync('src/app/api/whatsapp/messages/send-media/route.ts', 'utf8');

function noLegacyRead() {
  return {
    select() {
      throw new Error('legacy read must not run');
    }
  };
}

test('Evolution channels never consult the Meta Vault or legacy token column', async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: null, error: null };
    },
    from() {
      calls += 1;
      return noLegacyRead();
    }
  };

  for (const number of [
    { id: '1', phone_number_id: 'evolution:store-a', settings: {} },
    { id: '2', phone_number_id: '123', settings: { provider: 'evolution' } }
  ]) {
    assert.equal(isEvolutionWhatsappNumber(number), true);
    assert.equal(await resolveMetaWhatsappAccessToken(client, number), '');
    assert.equal(await hasMetaWhatsappAccessToken(client, number), false);
  }

  assert.equal(calls, 0);
});

test('Meta token resolution is Vault-first and exposes only the resolved value to its caller', async () => {
  const client = {
    async rpc(name: string) {
      assert.equal(name, 'get_whatsapp_access_token');
      return { data: 'vault-token', error: null };
    },
    from() {
      return noLegacyRead();
    }
  };

  assert.equal(
    await resolveMetaWhatsappAccessToken(client, { id: 'meta-1', phone_number_id: '123', settings: { provider: 'meta_cloud' } }),
    'vault-token'
  );
});

test('legacy fallback is narrow, temporary and only used when the Vault RPC does not exist', async () => {
  let selected = '';
  const client = {
    async rpc() {
      return { data: null, error: { code: 'PGRST202', message: 'function not found in schema cache' } };
    },
    from(table: string) {
      assert.equal(table, 'whatsapp_numbers');
      return {
        select(columns: string) {
          selected = columns;
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { access_token: 'legacy-token' }, error: null };
                }
              };
            }
          };
        }
      };
    }
  };

  assert.equal(await resolveMetaWhatsappAccessToken(client, { id: 'meta-1' }), 'legacy-token');
  assert.equal(selected, 'access_token');
});

test('unexpected Vault failures fail closed without reading the plaintext fallback', async () => {
  const client = {
    async rpc() {
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    },
    from() {
      return noLegacyRead();
    }
  };

  await assert.rejects(
    resolveMetaWhatsappAccessToken(client, { id: 'meta-1' }),
    /credencial segura/
  );
});

test('migration is additive, transactional, RPC-restricted and does not migrate data automatically', () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /add column if not exists access_token_secret_id uuid/i);
  assert.match(migration, /security definer/g);
  assert.match(migration, /set search_path = ''/g);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /select\s+public\.migrate_whatsapp_access_token_to_vault\s*\(/i);
  assert.doesNotMatch(migration, /update\s+public\.whatsapp_numbers\s+set\s+access_token\s*=\s*null/i);
  assert.doesNotMatch(migration, /set\s+access_token_secret_id\s*=\s*v_secret_id,\s*access_token\s*=\s*v_token/i);
  assert.match(migration, /from vault\.secrets\s+where name = v_secret_name/i);
});

test('API responses and inbound lookups exclude Meta secrets', () => {
  assert.match(masterRoute, /access_token: _accessToken/);
  assert.match(masterRoute, /verify_token: _verifyToken/);
  assert.match(masterRoute, /access_token_secret_id: _secretId/);
  assert.doesNotMatch(metaWebhook, /\.select\(['"]\*, stores/);
  assert.match(metaWebhook, /\.select\('id, store_id, label, phone_number_id, is_active, settings, stores/);
  assert.doesNotMatch(masterPage, /form\.verify_token|number\.verify_token|defaultVerifyToken/);
  assert.match(masterPage, /segredos do ambiente Vercel/i);
  assert.doesNotMatch(masterRoute, /legacyPayload|\.update\(\{[\s\S]{0,200}access_token/);
  assert.match(masterRoute, /armazenamento seguro do WhatsApp ainda não está disponível/i);
});

test('Master Meta management excludes and refuses Evolution records', () => {
  assert.match(masterRoute, /filter\([\s\S]{0,120}!isEvolutionWhatsappNumber\(number\)/);
  assert.match(masterRoute, /if \(isEvolutionWhatsappNumber\(currentNumber\)\)/);
  assert.match(masterRoute, /Integrações Evolution não podem ser alteradas pela configuração Meta/);
});

test('Meta send routes resolve the token server-side while Evolution routes stay isolated', () => {
  for (const route of [sendRoute, sendMediaRoute]) {
    assert.match(route, /resolveMetaWhatsappAccessToken/);
    assert.match(route, /Bearer \$\{metaAccessToken\}/);
    assert.doesNotMatch(route, /number\.access_token/);
  }

  for (const route of [evolutionWebhook, managedEvolution]) {
    assert.doesNotMatch(route, /resolveMetaWhatsappAccessToken|get_whatsapp_access_token|access_token_secret_id/);
  }
  assert.doesNotMatch(evolutionWebhook, /\.from\('whatsapp_numbers'\)[\s\S]{0,100}\.select\('\*'\)/);
  assert.doesNotMatch(managedEvolution, /\.from\('whatsapp_numbers'\)[\s\S]{0,100}\.select\('\*'\)/);
});
