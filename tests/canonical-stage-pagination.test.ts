import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCards, mergeStageCards, revalidateStagePages, type StageCard, type StageCursor } from '../src/lib/pipelineStagePagination';
const cards = (size: number): StageCard[] => Array.from({ length: size }, (_, i) => ({ id: String(size-i).padStart(5,'0'), status: i === 0 || i === 232 ? 'sale_confirmed' : 'new_lead', created_at: '2026-01-01T00:00:00Z' }));
function reader(rows: StageCard[], stage: string, size = 50) {
  return async (cursor: StageCursor | null) => {
    const available = rows.filter(r => r.status === stage && (!cursor || compareCards(r, { ...cursor, status: stage }) > 0)).sort(compareCards);
    const leads = available.slice(0, size);
    const last = leads[leads.length-1];
    return { leads, next_cursor: available.length > size ? { id: last.id, created_at: last.created_at } : null };
  };
}
for (const size of [200,201,550]) test(`${size} cards preserve canonical sales independently of global position`, async () => {
  const rows = cards(size);
  const expected = rows.filter(r=>r.status==='sale_confirmed');
  const result = await revalidateStagePages(reader(rows,'sale_confirmed'),1);
  assert.deepEqual(result.leads, expected);
  assert.equal(result.leads.length, size > 232 ? 2 : 1);
});
test('independent pages and stable cursor', async () => {
  const rows = cards(550);
  const newLeads = await revalidateStagePages(reader(rows,'new_lead'),2);
  const sales = await revalidateStagePages(reader(rows,'sale_confirmed'),1);
  assert.equal(newLeads.leads.length,100); assert.equal(sales.leads.length,2);
  assert.equal(new Set(mergeStageCards(newLeads.leads,sales.leads).map(r=>r.id)).size,102);
});
test('realtime revalidation retains the loaded boundary after newer arrivals', async () => {
  const rows = cards(550);
  const initial = await revalidateStagePages(reader(rows,'new_lead'),2);
  const newer = { id: '99999', status: 'new_lead', created_at: '2026-02-01T00:00:00Z' };
  const refreshed = await revalidateStagePages(reader([newer,...rows],'new_lead'),2,initial.leads.at(-1));
  for (const card of initial.leads) assert.ok(refreshed.leads.some(r=>r.id===card.id));
  assert.equal(new Set(refreshed.leads.map(r=>r.id)).size,refreshed.leads.length);
});
test('stage movement replaces old stage and merge deduplicates', async () => {
  const rows = cards(550); const moved = { ...rows[2], status: 'sale_confirmed' };
  const updated = rows.map(r=>r.id===moved.id?moved:r);
  const a = await revalidateStagePages(reader(updated,'new_lead'),2);
  const b = await revalidateStagePages(reader(updated,'sale_confirmed'),1);
  assert.ok(!a.leads.some(r=>r.id===moved.id)); assert.ok(b.leads.some(r=>r.id===moved.id));
  assert.equal(mergeStageCards(a.leads,[...b.leads,...b.leads]).length,a.leads.length+b.leads.length);
});
test('stale stage response cannot overwrite a newer movement',()=>{
 const old={id:'same',status:'new_lead',created_at:'2026-01-01',updated_at:'2026-01-01'};
 const current={...old,status:'sale_confirmed',updated_at:'2026-01-02'};
 assert.equal(mergeStageCards([current],[old])[0].status,'sale_confirmed');
});
test('nonadvancing cursor fails instead of looping indefinitely',async()=>{
 const cursor={id:'same',created_at:'2026-01-01'};
 await assert.rejects(revalidateStagePages(async()=>({leads:[{...cursor,status:'new_lead'}],next_cursor:cursor}),2),/did not advance/);
});
