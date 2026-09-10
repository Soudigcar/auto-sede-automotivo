import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../src/lib/commercialMetricsHomologationManifest.json';
import { forbiddenMetricsRefs } from '../src/lib/commercialMetricsHomologation';

const args = process.argv.slice(2);
const kind = args[args.indexOf('--kind') + 1];
const ref = args[args.indexOf('--project-ref') + 1];
if (!args.includes('--kind') || !args.includes('--project-ref') || !['crm','autocar'].includes(kind) || !manifest.approved || !/^[a-z]{20}$/.test(ref) || forbiddenMetricsRefs.includes(ref) || ref !== (kind === 'crm' ? manifest.crmProjectRef : manifest.autocarProjectRef) || manifest.crmProjectRef === manifest.autocarProjectRef) throw new Error('Explicit authorized project manifest required');
const root = resolve(import.meta.dirname, '..');
const files = [`supabase/homologation/commercial-metrics-v1/${kind}/schema.sql`, ...(kind === 'crm' ? ['supabase/proposed/commercial-metrics-v1/crm.sql','supabase/proposed/commercial-metrics-v1/crm-autocar.sql'] : ['supabase/proposed/commercial-metrics-v1/autocar.sql']), `supabase/homologation/commercial-metrics-v1/${kind}/seed.sql`];
// Offline output only. Never connects, links, deploys, or reads credentials.
process.stdout.write(`begin;\nset local app.metrics_homologation = 'synthetic-only';\nset local app.metrics_project_ref = '${ref}';\n` + files.map(file => readFileSync(resolve(root,file),'utf8').replace(/^begin;|^commit;/gm,'')).join('\n') + '\ncommit;\n');
