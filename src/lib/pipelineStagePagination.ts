export const PIPELINE_STAGES = ['new_lead', 'in_service', 'scheduled', 'appointment_cancelled', 'no_show', 'showed_up', 'sale_confirmed', 'lost'] as const;
export type StageCard = { id: string; status: string; created_at: string; updated_at?: string | null };
export type StageCursor = { created_at: string; id: string };
export function compareCards(a: StageCard, b: StageCard) {
  return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}
export function mergeStageCards<T extends StageCard>(current: T[], incoming: T[]) {
  const cards = new Map(current.map(card => [card.id, card]));
  incoming.forEach(card => {
    const previous = cards.get(card.id);
    if (!previous || !previous.updated_at || !card.updated_at || card.updated_at >= previous.updated_at) cards.set(card.id, card);
  });
  return [...cards.values()].sort(compareCards);
}
/** Revalidation replaces each previously loaded page, not just the first page. */
export async function revalidateStagePages<T extends StageCard>(
  read: (cursor: StageCursor | null) => Promise<{ leads: T[]; next_cursor: StageCursor | null }>,
  pageCount: number,
  previousBoundary?: StageCard | null
) {
  let cursor: StageCursor | null = null;
  let cards: T[] = [];
  for (let page = 0; ; page++) {
    const result = await read(cursor);
    if (cursor && result.next_cursor && cursor.id === result.next_cursor.id && cursor.created_at === result.next_cursor.created_at) {
      throw new Error('Stage cursor did not advance');
    }
    cards = mergeStageCards(cards, result.leads);
    cursor = result.next_cursor;
    const last = cards[cards.length - 1];
    const boundaryReached = !previousBoundary || (last && compareCards(last, previousBoundary) >= 0);
    if (!cursor || (page + 1 >= Math.max(1, pageCount) && boundaryReached)) break;
  }
  return { leads: cards, next_cursor: cursor };
}
