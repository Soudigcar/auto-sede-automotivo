'use client';

import { useMemo, useState } from 'react';
import { Car, ExternalLink, FileClock, ImageOff, Store, X } from 'lucide-react';

type Props = {
  open: boolean;
  store: any | null;
  pending: any[];
  vehicles: any[];
  canOperate: boolean;
  onClose: () => void;
  onReview: (item: any) => void;
};

type DrawerTab = 'pending' | 'active';

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateText(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sourceLabel(source: unknown) {
  const value = normalized(source);
  if (value === 'olx') return 'OLX';
  if (value === 'website') return 'Site da loja';
  if (value === 'file') return 'Arquivo';
  return value || 'Origem não identificada';
}

export function StorePendingReviewDrawer({
  open,
  store,
  pending,
  vehicles,
  canOperate,
  onClose,
  onReview
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('pending');

  const storePending = useMemo(
    () => pending.filter((item) => item.store?.id === store?.id),
    [pending, store?.id]
  );

  const storeVehicles = useMemo(
    () => vehicles.filter((item) => item.store?.id === store?.id && !['excluido', 'vendido'].includes(normalized(item.status))),
    [vehicles, store?.id]
  );

  if (!open || !store) return null;

  return (
    <div className="fixed inset-0 z-[170] bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Conferir anúncios da loja ${store.name || ''}`}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar painel" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-zinc-50 shadow-2xl">
        <header className="border-b border-zinc-200 bg-white px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Conferência por loja</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><Store size={21} /></div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-950">{store.name || 'Loja não identificada'}</h2>
                  <p className="mt-1 text-sm font-bold text-zinc-500">Revise pendências e confira os anúncios ativos sem sair do evento.</p>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200" aria-label="Fechar">
              <X size={19} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTab('pending')} className={`rounded-2xl border p-4 text-left transition ${tab === 'pending' ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-600'}`}>
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><FileClock size={15} /> Pendentes</span>
              <strong className="mt-2 block text-2xl font-black">{storePending.length}</strong>
            </button>
            <button type="button" onClick={() => setTab('active')} className={`rounded-2xl border p-4 text-left transition ${tab === 'active' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-white text-zinc-600'}`}>
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide"><Car size={15} /> Ativos</span>
              <strong className="mt-2 block text-2xl font-black">{storeVehicles.length}</strong>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {tab === 'pending' ? (
            <div className="space-y-4">
              {storePending.map((item) => (
                <article key={`${item.kind}-${item.id}`} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">{sourceLabel(item.source)}</span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">{normalized(item.status) === 'reviewing' ? 'Em conferência' : 'Pendente'}</span>
                      </div>
                      <h3 className="mt-3 break-words text-lg font-black text-zinc-950">{item.title || item.url || 'Anúncio pendente'}</h3>
                      <p className="mt-2 text-xs font-bold text-zinc-400">Recebido em {dateText(item.created_at)}</p>
                    </div>
                    <button type="button" disabled={!canOperate} onClick={() => onReview(item)} className="premium-button-primary justify-center text-xs disabled:cursor-not-allowed disabled:opacity-50">
                      Conferir
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Fotos encontradas</p>
                      <strong className="mt-1 block text-xl font-black text-zinc-950">{Number(item.photos || 0)}</strong>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">Campos faltantes</p>
                      <p className="mt-1 text-sm font-black text-amber-700">{item.missing_fields?.length ? item.missing_fields.join(', ') : 'Serão verificados ao importar'}</p>
                    </div>
                  </div>

                  {item.error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">Último erro: {item.error}</p> : null}
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-zinc-500 hover:text-zinc-950"><ExternalLink size={14} /> Abrir link original</a> : null}
                </article>
              ))}
              {!storePending.length ? <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm font-bold text-zinc-500">Esta loja não possui anúncios pendentes neste evento.</div> : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {storeVehicles.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                  <div className="aspect-[16/9] bg-zinc-100">
                    {item.image_url ? <img src={item.image_url} alt={item.name || 'Veículo'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-400"><ImageOff size={30} /></div>}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-black text-zinc-950">{item.name || 'Veículo sem nome'}</h3>
                    <strong className="mt-2 block text-lg font-black text-zinc-950">{money(item.price)}</strong>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{normalized(item.status) || 'Ativo'}</span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${item.portal_visible ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{item.portal_visible ? 'Portal' : 'Somente evento'}</span>
                    </div>
                  </div>
                </article>
              ))}
              {!storeVehicles.length ? <div className="sm:col-span-2 rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm font-bold text-zinc-500">Esta loja ainda não possui anúncios ativos neste evento.</div> : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
