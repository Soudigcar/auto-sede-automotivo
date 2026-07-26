'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCcw, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { MasterSidebar } from '@/components/MasterSidebar';

type SaleRow = {
  id: string;
  confirmed_at: string | null;
  event_name: string;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  vehicle_name: string;
  seller_name: string;
  payment_type: string;
  financing_bank: string;
  sale_value: number | null;
  installment_count: number | null;
  has_down_payment: boolean | null;
  down_payment_value: number | null;
  financed_amount: number | null;
  installment_value: number | null;
  has_trade_in: boolean | null;
};

type Payload = {
  rows: SaleRow[];
  events: any[];
  stores: any[];
  summary: {
    sales_count: number;
    total_revenue: number;
    financed_sales: number;
    with_down_payment: number;
    with_trade_in: number;
  };
  updated_at: string;
};

const emptySummary = { sales_count: 0, total_revenue: 0, financed_sales: 0, with_down_payment: 0, with_trade_in: 0 };

function money(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function paymentLabel(value: string) {
  if (value === 'cash') return 'À vista';
  if (value === 'financed') return 'Financiado';
  if (value === 'consortium') return 'Consórcio';
  if (value === 'other') return 'Outro';
  return 'Não informado';
}

function booleanLabel(value: boolean | null, yes: string, no: string) {
  if (value === true) return yes;
  if (value === false) return no;
  return 'Não informado';
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export function MasterSalesCommercialReport() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [eventId, setEventId] = useState('all');
  const [storeId, setStoreId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  const visibleStores = useMemo(
    () => stores.filter((store) => eventId === 'all' || store.event_id === eventId),
    [stores, eventId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('Carregando relatório comercial...');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      const query = new URLSearchParams({ event_id: eventId, store_id: storeId, date_from: dateFrom, date_to: dateTo });
      const response = await fetch(`/api/master/sales-commercial-report?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o relatório.');
      const result = payload as Payload;
      setRows(result.rows || []);
      setEvents(result.events || []);
      setStores(result.stores || []);
      setSummary(result.summary || emptySummary);
      setUpdatedAt(result.updated_at || '');
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o relatório comercial.');
    } finally {
      setLoading(false);
    }
  }, [supabase, eventId, storeId, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setStoreId('all'); }, [eventId]);

  function downloadCsv() {
    if (!rows.length) {
      setMessage('Não existem vendas no filtro atual para exportar.');
      return;
    }

    const headers = [
      'Data da venda', 'Evento', 'Loja', 'Cliente', 'Telefone', 'Veículo', 'Vendedor',
      'Forma de pagamento', 'Banco / instituição', 'Valor da venda', 'Parcelas',
      'Teve entrada', 'Valor da entrada', 'Valor financiado', 'Valor da parcela', 'Veículo na troca'
    ];
    const lines = rows.map((row) => [
      row.confirmed_at ? new Date(row.confirmed_at).toLocaleString('pt-BR') : '',
      row.event_name,
      row.store_name,
      row.customer_name,
      row.customer_phone,
      row.vehicle_name,
      row.seller_name,
      paymentLabel(row.payment_type),
      row.financing_bank || 'Não informado',
      row.sale_value === null ? '' : Number(row.sale_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      row.installment_count ?? '',
      booleanLabel(row.has_down_payment, 'Sim', 'Não'),
      row.down_payment_value === null ? '' : Number(row.down_payment_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      row.financed_amount === null ? '' : Number(row.financed_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      row.installment_value === null ? '' : Number(row.installment_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      booleanLabel(row.has_trade_in, 'Sim', 'Não')
    ].map(csvCell).join(';'));

    const csv = `\uFEFF${headers.map(csvCell).join(';')}\n${lines.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-comercial-vendas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: 'Vendas no filtro', value: summary.sales_count.toLocaleString('pt-BR') },
    { label: 'Faturamento registrado', value: money(summary.total_revenue) },
    { label: 'Vendas financiadas', value: summary.financed_sales.toLocaleString('pt-BR') },
    { label: 'Vendas com entrada', value: summary.with_down_payment.toLocaleString('pt-BR') },
    { label: 'Vendas com troca', value: summary.with_trade_in.toLocaleString('pt-BR') }
  ];

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-zinc-950 md:p-6">
      <section className="mx-auto flex max-w-[1700px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <MasterSidebar active="Relatórios" />
        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">Gestão Master</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#101828] md:text-4xl">Relatório Comercial de Vendas</h1>
              <p className="mt-2 text-sm text-zinc-500">Pagamento, banco, entrada, parcelas, financiamento e veículo na troca.</p>
              {updatedAt ? <p className="mt-1 text-xs text-zinc-400">Atualizado em {new Date(updatedAt).toLocaleString('pt-BR')}</p> : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-black text-zinc-700 shadow-sm disabled:opacity-60"><RefreshCcw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
              <button onClick={downloadCsv} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20"><Download size={17} /> Baixar CSV</button>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{message}</div> : null}

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-500 shadow-sm">Evento
              <select value={eventId} onChange={(event) => setEventId(event.target.value)} className="mt-2 w-full bg-transparent text-base font-black text-zinc-950 outline-none"><option value="all">Todos os eventos</option>{events.map((event) => <option key={event.id} value={event.id}>{event.event_name}</option>)}</select>
            </label>
            <label className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-500 shadow-sm">Loja
              <select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="mt-2 w-full bg-transparent text-base font-black text-zinc-950 outline-none"><option value="all">Todas as lojas</option>{visibleStores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>
            </label>
            <label className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-500 shadow-sm">Data inicial
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 w-full bg-transparent text-base font-black text-zinc-950 outline-none" />
            </label>
            <label className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-500 shadow-sm">Data final
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-2 w-full bg-transparent text-base font-black text-zinc-950 outline-none" />
            </label>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {cards.map((card, index) => (
              <article key={card.label} className="rounded-[22px] border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-zinc-500">{card.label}</p><strong className="mt-3 block break-words text-2xl font-black text-zinc-950">{card.value}</strong></div>{index === 1 ? <WalletCards className="text-emerald-600" size={21} /> : <FileSpreadsheet className="text-red-600" size={21} />}</div>
              </article>
            ))}
          </section>

          <section className="mt-5 overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-5 py-4"><h2 className="text-lg font-black">Vendas detalhadas</h2><p className="mt-1 text-xs text-zinc-500">Os campos não preenchidos aparecem como “Não informado”.</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-[1750px] w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500"><tr>{['Data','Loja','Cliente','Veículo','Vendedor','Pagamento','Banco','Valor','Parcelas','Entrada','Valor entrada','Financiado','Parcela','Troca'].map((header) => <th key={header} className="px-4 py-3 font-black uppercase tracking-wide">{header}</th>)}</tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-50/70">
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-zinc-600">{row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString('pt-BR') : 'Não informado'}</td>
                      <td className="px-4 py-4 font-black text-zinc-900">{row.store_name}</td>
                      <td className="px-4 py-4"><p className="font-black text-zinc-900">{row.customer_name}</p><p className="mt-1 text-zinc-400">{row.customer_phone}</p></td>
                      <td className="px-4 py-4 font-bold text-zinc-700">{row.vehicle_name}</td>
                      <td className="px-4 py-4 font-bold text-zinc-700">{row.seller_name}</td>
                      <td className="px-4 py-4 font-black text-zinc-700">{paymentLabel(row.payment_type)}</td>
                      <td className="px-4 py-4 text-zinc-600">{row.financing_bank || 'Não informado'}</td>
                      <td className="whitespace-nowrap px-4 py-4 font-black text-emerald-700">{money(row.sale_value)}</td>
                      <td className="px-4 py-4 text-center font-bold">{row.installment_count ?? '—'}</td>
                      <td className="px-4 py-4 font-bold">{booleanLabel(row.has_down_payment, 'Sim', 'Não')}</td>
                      <td className="whitespace-nowrap px-4 py-4">{money(row.down_payment_value)}</td>
                      <td className="whitespace-nowrap px-4 py-4">{money(row.financed_amount)}</td>
                      <td className="whitespace-nowrap px-4 py-4">{money(row.installment_value)}</td>
                      <td className="px-4 py-4 font-bold">{booleanLabel(row.has_trade_in, 'Sim', 'Não')}</td>
                    </tr>
                  ))}
                  {!rows.length ? <tr><td colSpan={14} className="px-5 py-12 text-center font-bold text-zinc-400">Nenhuma venda encontrada no filtro atual.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
