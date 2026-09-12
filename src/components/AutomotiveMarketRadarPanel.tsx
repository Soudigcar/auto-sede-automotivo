import { createClient } from '@supabase/supabase-js';

type Segment = {
  id: string;
  state_code: 'DF' | 'GO' | 'DF+GO';
  brand: string;
  model: string;
  version: string;
  model_year: number;
  fuel: string;
  transmission: string;
  valid_listing_count: number;
  minimum_price: number | null;
  maximum_price: number | null;
  median_price: number | null;
  average_price: number | null;
  fipe_price: number | null;
  difference_to_fipe_percent: number | null;
  confidence: number | null;
};

type Run = {
  id: string;
  collected_at: string;
  status: string;
  valid_listing_count: number;
  rejected_count: number;
  fipe_reference_month: string | null;
};

function money(value: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
}

function percent(value: number | null) {
  if (value === null || value === undefined) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${Number(value).toFixed(1)}%`;
}

export async function AutomotiveMarketRadarPanel() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return (
      <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-black text-amber-900">Radar de mercado regional</h2>
        <p className="mt-2 text-sm text-amber-800">
          Conexão de servidor indisponível. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </section>
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: latestRun, error: runError } = await supabase
    .from('automotive_market_runs')
    .select('id,collected_at,status,valid_listing_count,rejected_count,fipe_reference_month')
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle<Run>();

  if (runError) {
    return (
      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-zinc-900">Radar de mercado regional</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Estrutura aguardando aprovação e aplicação da migration. Nenhum dado de produção foi alterado.
        </p>
      </section>
    );
  }

  if (!latestRun) {
    return (
      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-zinc-900">Radar DF + Goiás</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Banco preparado, aguardando a primeira coleta validada.
        </p>
      </section>
    );
  }

  const { data } = await supabase
    .from('automotive_market_segments')
    .select('id,state_code,brand,model,version,model_year,fuel,transmission,valid_listing_count,minimum_price,maximum_price,median_price,average_price,fipe_price,difference_to_fipe_percent,confidence')
    .eq('run_id', latestRun.id)
    .order('valid_listing_count', { ascending: false })
    .limit(30);

  const segments = (data || []) as Segment[];

  return (
    <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Dados reais · somente Master</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-900">Radar DF + Goiás</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Última coleta: {new Date(latestRun.collected_at).toLocaleString('pt-BR')} · FIPE {latestRun.fipe_reference_month || 'não informada'}
          </p>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">{latestRun.valid_listing_count} válidos</span>
          <span className="rounded-full bg-zinc-100 px-3 py-2 text-zinc-600">{latestRun.rejected_count} descartados</span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-3">Região</th>
              <th className="px-3 py-3">Veículo</th>
              <th className="px-3 py-3">Amostra</th>
              <th className="px-3 py-3">Mínimo</th>
              <th className="px-3 py-3">Mediana</th>
              <th className="px-3 py-3">Média</th>
              <th className="px-3 py-3">Máximo</th>
              <th className="px-3 py-3">FIPE</th>
              <th className="px-3 py-3">Diferença</th>
              <th className="px-3 py-3">Confiança</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {segments.map((segment) => (
              <tr key={segment.id} className="align-top">
                <td className="px-3 py-4 font-black text-red-600">{segment.state_code}</td>
                <td className="min-w-[280px] px-3 py-4">
                  <div className="font-black text-zinc-900">{segment.brand} {segment.model}</div>
                  <div className="mt-1 text-xs text-zinc-500">{segment.version} · {segment.model_year} · {segment.fuel} · {segment.transmission}</div>
                </td>
                <td className="px-3 py-4 font-bold">{segment.valid_listing_count}</td>
                <td className="px-3 py-4">{money(segment.minimum_price)}</td>
                <td className="px-3 py-4 font-bold">{money(segment.median_price)}</td>
                <td className="px-3 py-4">{money(segment.average_price)}</td>
                <td className="px-3 py-4">{money(segment.maximum_price)}</td>
                <td className="px-3 py-4">{money(segment.fipe_price)}</td>
                <td className="px-3 py-4 font-black">{percent(segment.difference_to_fipe_percent)}</td>
                <td className="px-3 py-4">{segment.confidence === null ? '—' : `${Number(segment.confidence).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!segments.length && (
        <p className="mt-6 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">
          A coleta existe, mas ainda não há segmentos agregados para exibir.
        </p>
      )}
    </section>
  );
}