import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../src/lib/commercialMetricsHomologationManifest.json';
import { parseBranchArguments, preflightBranch } from './lib/metrics-branch-preflight';

async function main() {
const target = parseBranchArguments(process.argv.slice(2));
const verified = await preflightBranch(target, manifest, process.env.SUPABASE_ACCESS_TOKEN);
const { kind, projectRef: ref } = verified;
const root = resolve(import.meta.dirname, '..');
const files = [`supabase/homologation/commercial-metrics-v1/${kind}/schema.sql`, ...(kind === 'crm' ? ['supabase/proposed/commercial-metrics-v1/crm.sql','supabase/proposed/commercial-metrics-v1/crm-autocar.sql'] : ['supabase/proposed/commercial-metrics-v1/autocar.sql']), `supabase/homologation/commercial-metrics-v1/${kind}/seed.sql`];
// Output only after an official read-only preflight. Never connects to a database.
// SQL tags identify the bundle, not the database. Revalidate immediately before application.
process.stdout.write(`-- Preflight ${verified.definitionVersion}: ${verified.verifiedAt}\n-- Intended API: ${verified.apiUrl}; parent: ${verified.expectedParentRef}\n-- Audit tags below are NOT database identity proof.\nbegin;\nset local app.metrics_homologation = 'synthetic-only';\nset local app.metrics_preflight = 'branch-metadata-v1';\nset local app.metrics_project_ref = '${ref}';\n` + files.map(file => readFileSync(resolve(root,file),'utf8').replace(/^begin;|^commit;/gm,'')).join('\n') + '\ncommit;\n');
}
void main().catch(() => { process.stderr.write('Homologation preflight failed; no bundle generated.\n'); process.exitCode = 1; });
