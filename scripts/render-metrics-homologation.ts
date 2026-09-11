import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../src/lib/commercialMetricsHomologationManifest.json';
import { parseHostedBranchArguments, preflightHostedBranch } from './lib/metrics-hosted-branch-preflight';

async function main() {
  const target = parseHostedBranchArguments(process.argv.slice(2));
  const verified = await preflightHostedBranch(target, manifest, process.env.SUPABASE_ACCESS_TOKEN);
  const { kind, projectRef: ref } = verified;
  const root = resolve(import.meta.dirname, '..');
  const files = [
    `supabase/homologation/commercial-metrics-v1/${kind}/branch-contract.sql`,
    ...(kind === 'crm'
      ? ['supabase/proposed/commercial-metrics-v1/crm.sql', 'supabase/proposed/commercial-metrics-v1/crm-autocar.sql']
      : ['supabase/proposed/commercial-metrics-v1/autocar.sql']),
    `supabase/homologation/commercial-metrics-v1/${kind}/branch-seed.sql`,
  ];
  process.stdout.write(
    `-- Hosted branch preflight ${verified.definitionVersion}: ${verified.verifiedAt}\n` +
      `-- Intended API: ${verified.apiUrl}; parent: ${verified.expectedParentRef}\n` +
      '-- Audit tags below are NOT database identity proof.\n' +
      'begin;\n' +
      "set local app.metrics_homologation = 'synthetic-only';\n" +
      "set local app.metrics_target_mode = 'branch';\n" +
      "set local app.metrics_preflight = 'branch-metadata-v2';\n" +
      `set local app.metrics_project_ref = '${ref}';\n` +
      files.map((file) => readFileSync(resolve(root, file), 'utf8').replace(/^begin;|^commit;/gm, '')).join('\n') +
      '\ncommit;\n',
  );
}

void main().catch(() => {
  process.stderr.write('Hosted homologation preflight failed; no bundle generated.\n');
  process.exitCode = 1;
});
