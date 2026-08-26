'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Car, CheckCircle2, Loader2, Plus, Tag, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StoreOption = {
  id: string;
  store_name: string;
  slug: string;
  event_id: string | null;
};

type StockVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | null;
  price: number | null;
  status: string | null;
  label?: string;
};

type LeadContext = {
  role: string;
  profile_name: string;
  store?: StoreOption | null;
  stores: StoreOption[];
  stock?: StockVehicle[];
};

const emptyForm = {
  customer_name: '',
  customer_phone: '',
  interested_vehicle: '',
  interested_vehicle_id: '',
  customer_bank: '',
  vehicle_category_interest: '',
  origin: 'manual_pipeline',
  notes: '',
  store_id: ''
};

const roleLabels: Record<string, string> = {
  master: 'Master',
  store: 'Gestor da loja',
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

function activeRoute(pathname: string) {
  if (/^\/loja\/[^/]+\/pipeline\/?$/.test(pathname)) return true;
  return pathname === '/master/dashboard/live' || pathname === '/master/lead-monitoring';
}

function refreshVisiblePipeline() {
  const labels = ['atualizar pipeline', 'atualizar dashboard', 'atualizar monitoramento'];
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => {
    const text = String(item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return labels.some((label) => text.includes(label));
  });
  button?.click();
}

function vehicleLabel(vehicle: StockVehicle) {
  return vehicle.label || [vehicle.brand, vehicle.model, vehicle.version, vehicle.year]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function PipelineAddLeadWithStock({ onSaved }: { onSaved?: () => void } = {}) {
  const pathname = usePathname() || '';
  const active = activeRoute(pathname);
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeadContext | null>(null);
  const [stock, setStock] = useState<StockVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const selectedVehicle = useMemo(
    () => stock.find((vehicle) => vehicle.id === form.interested_vehicle_id) || null,
    [stock, form.interested_vehicle_id]
  );

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function requestContext(storeId = '') {
    const accessToken = await token();
    const query = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    const response = await fetch(`/api/leads/manual${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar o cadastro.');
    return payload as LeadContext;
  }

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setMessage('Preparando cadastro e estoque...');
    setSuccess(false);

    try {
      const payload = await requestContext();
      const storeId = payload.role === 'master' ? '' : payload.store?.id || '';
      setContext(payload);
      setStock(payload.stock || []);
      setForm({ ...emptyForm, store_id: storeId });
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível preparar o cadastro.');
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setContext(null);
    setStock([]);
    setMessage('');
    setSuccess(false);
    setForm(emptyForm);
  }

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function changeStore(storeId: string) {
    setForm((current) => ({
      ...current,
      store_id: storeId,
      interested_vehicle: '',
      interested_vehicle_id: ''
    }));
    setStock([]);
    setSuccess(false);

    if (!storeId) {
      setMessage('Selecione a loja para carregar o estoque.');
      return;
    }

    setStockLoading(true);
    setMessage('Carregando estoque da loja...');

    try {
      const payload = await requestContext(storeId);
      setStock(payload.stock || []);
      setMessage((payload.stock || []).length ? '' : 'Esta loja não possui veículos disponíveis no estoque. Você pode digitar o interesse manualmente.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o estoque da loja.');
    } finally {
      setStockLoading(false);
    }
  }

  function selectVehicle(vehicleId: string) {
    const vehicle = stock.find((item) => item.id === vehicleId) || null;
    setForm((current) => ({
      ...current,
      interested_vehicle_id: vehicleId,
      interested_vehicle: vehicle ? vehicleLabel(vehicle) : ''
    }));
  }

  function typeVehicle(value: string) {
    setForm((current) => ({
      ...current,
      interested_vehicle: value,
      interested_vehicle_id: current.interested_vehicle_id ? '' : current.interested_vehicle_id
    }));
  }

  async function saveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (context?.role === 'master' && !form.store_id) {
      setMessage('Selecione a loja que receberá o lead.');
      return;
    }

    setSaving(true);
    setSuccess(false);
    setMessage('Adicionando lead...');

    try {
      const accessToken = await token();
      const response = await fetch('/api/leads/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(form)
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error || 'Não foi possível adicionar o lead.');

      setSuccess(true);
      setMessage(payload.message || 'Lead adicionado com sucesso.');
      const preservedStoreId = context?.role === 'master' ? form.store_id : context?.store?.id || '';
      setForm({ ...emptyForm, store_id: preservedStoreId });
      window.setTimeout(() => {
        onSaved?.();
        if (!onSaved) refreshVisiblePipeline();
      }, 250);
    } catch (error: any) {
      setSuccess(false);
      setMessage(error?.message || 'Não foi possível adicionar o lead.');
    } finally {
      setSaving(false);
    }
  }

  if (!active) return null;

  const storeSelected = context?.role !== 'master' || Boolean(form.store_id);

  return (
    <>
      <style>{styles}</style>
      <button type="button" className="pipeline-stock-add-button" onClick={() => void openModal()}>
        <Plus size={18} /> <span>Adicionar Lead</span>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-stock-overlay" role="dialog" aria-modal="true" aria-label="Adicionar lead" onMouseDown={closeModal}>
          <section className="pipeline-stock-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className="pipeline-stock-heading">
                <div className="pipeline-stock-icon"><UserPlus size={22} /></div>
                <div>
                  <p>Novo cadastro</p>
                  <h2>Adicionar Lead</h2>
                  <span>{context ? `${roleLabels[context.role] || context.role} · ${context.profile_name}` : 'Validando acesso'}</span>
                </div>
              </div>
              <button type="button" className="pipeline-stock-close" onClick={closeModal} aria-label="Fechar"><X size={20} /></button>
            </header>

            {loading ? (
              <div className="pipeline-stock-loading"><Loader2 className="animate-spin" size={30} /><p>Preparando cadastro e estoque...</p></div>
            ) : context ? (
              <form onSubmit={saveLead}>
                <div className="pipeline-stock-content">
                  {context.role === 'master' ? (
                    <label className="pipeline-stock-full">
                      Loja que receberá o lead
                      <select value={form.store_id} onChange={(event) => void changeStore(event.target.value)} required>
                        <option value="">Selecione a loja</option>
                        {context.stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="pipeline-stock-store pipeline-stock-full">
                      <small>Loja de destino</small>
                      <strong>{context.store?.store_name || 'Loja vinculada'}</strong>
                    </div>
                  )}

                  <label>
                    Nome do cliente
                    <input value={form.customer_name} onChange={(event) => update('customer_name', event.target.value)} placeholder="Nome completo" required minLength={3} />
                  </label>

                  <label>
                    Telefone / WhatsApp
                    <input value={form.customer_phone} onChange={(event) => update('customer_phone', event.target.value)} placeholder="(61) 99999-9999" required inputMode="tel" />
                  </label>

                  <div className="pipeline-stock-selector pipeline-stock-full">
                    <div className="pipeline-stock-selector-title"><Car size={18} /><strong>Selecionar veículo do estoque</strong></div>
                    <select
                      value={form.interested_vehicle_id}
                      onChange={(event) => selectVehicle(event.target.value)}
                      disabled={!storeSelected || stockLoading}
                    >
                      <option value="">Outro veículo / Digitar manualmente</option>
                      {stock.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)} — {money(vehicle.price)}</option>
                      ))}
                    </select>
                    {stockLoading ? <p><Loader2 className="animate-spin" size={14} /> Carregando estoque...</p> : null}
                    {!stockLoading && storeSelected && stock.length === 0 ? <p>Nenhum veículo disponível. Digite o interesse no campo abaixo.</p> : null}
                    {selectedVehicle ? (
                      <div className="pipeline-stock-selected">
                        <div><small>Veículo selecionado</small><strong>{vehicleLabel(selectedVehicle)}</strong></div>
                        <span><Tag size={14} /> {money(selectedVehicle.price)}</span>
                      </div>
                    ) : null}
                  </div>

                  <label>
                    Veículo de interesse
                    <input value={form.interested_vehicle} onChange={(event) => typeVehicle(event.target.value)} placeholder="Ex: HB20 2025" />
                  </label>

                  <label>
                    Banco do cliente
                    <input value={form.customer_bank} onChange={(event) => update('customer_bank', event.target.value)} placeholder="Ex: Bradesco" />
                  </label>

                  <label>
                    Categoria de interesse
                    <select value={form.vehicle_category_interest} onChange={(event) => update('vehicle_category_interest', event.target.value)}>
                      <option value="">Não informado</option>
                      <option value="Hatch">Hatch</option>
                      <option value="Sedan">Sedan</option>
                      <option value="SUV">SUV</option>
                      <option value="Picape">Picape</option>
                      <option value="Moto">Moto</option>
                      <option value="Utilitário">Utilitário</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </label>

                  <label>
                    Origem do lead
                    <select value={form.origin} onChange={(event) => update('origin', event.target.value)}>
                      <option value="manual_pipeline">Cadastro manual na pipeline</option>
                      <option value="walk_in">Cliente na loja</option>
                      <option value="event">Evento</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="indication">Indicação</option>
                      <option value="phone">Ligação</option>
                      <option value="other">Outra origem</option>
                    </select>
                  </label>

                  <label className="pipeline-stock-full">
                    Observações
                    <textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Informações importantes sobre o atendimento, entrada, troca ou preferência do cliente." />
                  </label>

                  {message ? (
                    <div className={`pipeline-stock-message pipeline-stock-full ${success ? 'is-success' : ''}`}>
                      {success ? <CheckCircle2 size={18} /> : null}<span>{message}</span>
                    </div>
                  ) : null}
                </div>

                <footer>
                  <button type="button" className="pipeline-stock-cancel" onClick={closeModal} disabled={saving}>Fechar</button>
                  <button type="submit" className="pipeline-stock-save" disabled={saving || stockLoading}>
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                    {saving ? 'Adicionando...' : 'Adicionar Lead'}
                  </button>
                </footer>
              </form>
            ) : (
              <div className="pipeline-stock-error">
                <p>{message || 'Não foi possível abrir o cadastro.'}</p>
                <button type="button" onClick={() => void openModal()}>Tentar novamente</button>
              </div>
            )}
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}

const styles = `
  .pipeline-stock-add-button{position:fixed;z-index:45;right:22px;top:20px;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:#dc2626;color:#fff;font-size:13px;font-weight:900;box-shadow:0 16px 35px rgba(220,38,38,.28);transition:.18s}
  .pipeline-stock-add-button:hover{background:#b91c1c;transform:translateY(-1px)}
  .pipeline-stock-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,7,18,.76);backdrop-filter:blur(8px)}
  .pipeline-stock-modal{width:min(880px,100%);max-height:94dvh;overflow:auto;border-radius:28px;background:#fff;color:#18181b;box-shadow:0 30px 100px rgba(0,0,0,.46)}
  .pipeline-stock-modal>header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid #e4e4e7;background:rgba(255,255,255,.97);backdrop-filter:blur(12px)}
  .pipeline-stock-heading{display:flex;align-items:center;gap:13px}.pipeline-stock-icon{display:flex;width:46px;height:46px;align-items:center;justify-content:center;flex:none;border-radius:16px;background:#fee2e2;color:#dc2626}.pipeline-stock-heading p{margin:0;color:#dc2626;font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.pipeline-stock-heading h2{margin:2px 0 0;font-size:25px;line-height:1.1;font-weight:950}.pipeline-stock-heading span{display:block;margin-top:4px;color:#71717a;font-size:11px;font-weight:700}
  .pipeline-stock-close{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border:0;border-radius:999px;background:#f4f4f5;color:#71717a}.pipeline-stock-loading,.pipeline-stock-error{display:flex;min-height:320px;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;text-align:center;color:#52525b}
  .pipeline-stock-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px}.pipeline-stock-content label{display:block;color:#3f3f46;font-size:13px;font-weight:850}.pipeline-stock-content input,.pipeline-stock-content select,.pipeline-stock-content textarea,.pipeline-stock-selector select{width:100%;margin-top:8px;border:1px solid #d4d4d8;border-radius:15px;background:#fff;padding:13px 14px;color:#18181b;font-size:14px;outline:none}.pipeline-stock-content input:focus,.pipeline-stock-content select:focus,.pipeline-stock-content textarea:focus,.pipeline-stock-selector select:focus{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.1)}.pipeline-stock-content textarea{min-height:105px;resize:vertical}.pipeline-stock-full{grid-column:1/-1}
  .pipeline-stock-store{border:1px solid #e4e4e7;border-radius:18px;background:#fafafa;padding:15px 16px}.pipeline-stock-store small{display:block;color:#a1a1aa;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.pipeline-stock-store strong{display:block;margin-top:6px;color:#18181b}
  .pipeline-stock-selector{border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;padding:16px}.pipeline-stock-selector-title{display:flex;align-items:center;gap:8px;color:#0f172a}.pipeline-stock-selector-title svg{color:#dc2626}.pipeline-stock-selector>p{display:flex;align-items:center;gap:6px;margin:9px 0 0;color:#64748b;font-size:12px;font-weight:650}.pipeline-stock-selected{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;border:1px solid #bbf7d0;border-radius:15px;background:#f0fdf4;padding:12px}.pipeline-stock-selected small{display:block;color:#15803d;font-size:10px;font-weight:900;text-transform:uppercase}.pipeline-stock-selected strong{display:block;margin-top:3px;color:#0f172a;font-size:13px}.pipeline-stock-selected span{display:flex;align-items:center;gap:5px;white-space:nowrap;border-radius:10px;background:#fff;padding:8px 10px;color:#15803d;font-size:12px;font-weight:900}
  .pipeline-stock-message{display:flex;align-items:center;gap:8px;border-radius:15px;background:#fff7ed;padding:13px 15px;color:#9a3412;font-size:13px;font-weight:750}.pipeline-stock-message.is-success{background:#ecfdf5;color:#047857}
  .pipeline-stock-modal form>footer{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e4e4e7;background:rgba(255,255,255,.98);padding:17px 22px}.pipeline-stock-cancel,.pipeline-stock-save{display:inline-flex;min-height:46px;align-items:center;justify-content:center;gap:8px;border-radius:15px;padding:11px 18px;font-size:14px;font-weight:900}.pipeline-stock-cancel{border:1px solid #d4d4d8;background:#fff;color:#52525b}.pipeline-stock-save{border:0;background:#dc2626;color:#fff}.pipeline-stock-save:disabled{opacity:.6}
  .pipeline-stock-error button{border:0;border-radius:14px;background:#dc2626;padding:11px 16px;color:#fff;font-weight:900}
  @media(max-width:720px){.pipeline-stock-add-button{top:auto;right:16px;bottom:calc(112px + env(safe-area-inset-bottom))}.pipeline-stock-overlay{align-items:flex-start;padding:8px}.pipeline-stock-modal{max-height:calc(100dvh - 16px);border-radius:22px}.pipeline-stock-content{grid-template-columns:1fr;padding:18px}.pipeline-stock-full{grid-column:auto}.pipeline-stock-selected{align-items:flex-start;flex-direction:column}.pipeline-stock-modal form>footer{padding-bottom:max(16px,env(safe-area-inset-bottom))}}
`;
