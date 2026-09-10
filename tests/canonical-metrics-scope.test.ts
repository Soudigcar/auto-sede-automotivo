import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMetricsSubject, readCanonicalCommercialMetrics, type MetricsContext } from '../src/lib/server/canonicalCommercialMetrics';
const actorId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
function context(role: MetricsContext['role'], memberExists = true): MetricsContext {
  const builder: any = { select: () => builder, eq: () => builder, in: () => builder, maybeSingle: async () => ({ data: memberExists ? { id: subjectId } : null, error: null }) };
  return { store: { id: 'store-synthetic' }, role, profile: { id: actorId, store_id: 'store-synthetic', role, status: 'active' }, supabase: { from: () => builder } };
}
for (const role of ['master','store','seller','pre_sales','prospector'] as const) test(`${role} scope is constructed on the server`, async () => {
  const c = context(role);
  assert.equal(await resolveMetricsSubject(c), ['master','store'].includes(role) ? null : actorId);
  if (!['master','store'].includes(role)) await assert.rejects(resolveMetricsSubject(c, subjectId));
});
for (const role of ['store','seller','pre_sales','prospector'] as const) test(`${role} cannot cross stores`, async () => {
  const c = context(role); c.profile.store_id = 'another-store';
  await assert.rejects(resolveMetricsSubject(c));
});
test('manager cannot select foreign or inactive subject', async () => assert.rejects(resolveMetricsSubject(context('store',false),subjectId)));
test('inactive actor is rejected', async () => { const c = context('master'); c.profile.status='inactive'; await assert.rejects(resolveMetricsSubject(c)); });
test('browser subject cannot inject a filter', async () => assert.rejects(resolveMetricsSubject(context('store'), 'id),or(store.eq.other)')));
test('RPC receives only validated actor and store', async () => {
  const c = context('store'); let args: any;
  c.supabase.rpc = async (_: string, params: any) => { args=params; return {data:{definition_version:'commercial_metrics_v1'},error:null}; };
  await readCanonicalCommercialMetrics(c,{subject:subjectId});
  assert.equal(args.p_actor_profile_id,actorId); assert.equal(args.p_store_id,'store-synthetic'); assert.equal(args.p_subject_user_id,subjectId);
});
test('missing migration fails closed without legacy fallback', async () => {
  const c = context('store'); c.supabase.rpc=async()=>({data:null,error:{code:'PGRST202'}});
  await assert.rejects(readCanonicalCommercialMetrics(c), /canônicas indisponíveis/);
});
test('stage cursor is intersected with member scope instead of replacing it',async()=>{
  const { readFileSync } = await import('node:fs');
  const ts = await import('typescript');
  const source=readFileSync('src/app/api/store/portal/pipeline/route.ts','utf8');
  const fragment=source.slice(source.indexOf('function historicalParticipantField'),source.indexOf('function pipelineLeadAccessMode'));
  const compiled=ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const apply=new Function('cleanText',`${compiled}; return applyPipelineLeadScope;`)((v:unknown)=>String(v||''));
  const filters:string[]=[];const query={or:(value:string)=>{filters.push(value);return query;},eq:()=>query};
  apply(query,{id:actorId},'seller','created_at.lt.2026-01-01T00:00:00Z');
  assert.equal(filters.length,1);
  assert.match(filters[0],/^and\(or\(assigned_user_id/);
  assert.ok(filters[0].includes(`seller_user_id.eq.${actorId}`));
  assert.ok(filters[0].endsWith('or(created_at.lt.2026-01-01T00:00:00Z))'));
});
