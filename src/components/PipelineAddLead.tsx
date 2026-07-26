'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { CheckCircle2, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StoreOption = {
  id: string;
  store_name: string;
  slug: string;
  event_id: string | null;
};

type LeadContext = {
  role: string;
  profile_name: string;
  store?: StoreOption;
  stores: StoreOption[];
};

const emptyForm = {
  customer_name: '',
  customer_phone: '',
  interested_vehicle: '',
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

export function PipelineAddLead() {
  const pathname = usePathname() || '';
  const active = activeRoute(pathname);
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeadContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setMessage('Preparando cadastro...');
    setSuccess(false);

    try {
      const accessToken = await token();
      const response = await fetch('/api/leads/manual', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar o cadastro.');

      setContext(payload);
      setForm((current) => ({
        ...emptyForm,
        store_id: payload.role === 'master' ? current.store_id : payload.store?.id || ''
      }));
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
    setMessage('');
    setSuccess(false);
    setForm(emptyForm);
  }

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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
      setForm({ ...emptyForm, store_id: context?.role === 'master' ? form.store_id : context?.store?.id || '' });
      window.setTimeout(refreshVisiblePipeline, 250);
    } catch (error: any) {
      setSuccess(false);
      setMessage(error?.message || 'Não foi possível adicionar o lead.');
    } finally {
      setSaving(false);
    }
  }

  if (!active) return null;

  return (
    <>
      <style>{styles}</style>
      <button type="button" className="pipeline-add-lead-button" onClick={() => void openModal()}>
        <Plus size={18} /> <span>Adicionar Lead</span>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-add-lead-overlay" role="dialog" aria-modal="true" aria-label="Adicionar lead" onMouseDown={closeModal}>
          <section className="pipeline-add-lead-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className="pipeline-add-lead-heading">
                <div className="pipeline-add-lead-icon"><UserPlus size={22} /></div>
                <div>
                  <p>Novo cadastro</p>
                  <h2>Adicionar Lead</h2>
                  <span>{context ? `${roleLabels[context.role] || context.role} · ${context.profile_name}` : 'Validando acesso'}</span>
                </div>
              </div>
              <button type="button" className="pipeline-add-lead-close" onClick={closeModal} aria-label="Fechar"><X size={20} /></button>
            </header>

            {loading ? (
              <div className="pipeline-add-lead-loading"><Loader2 className="animate-spin" size={30} /><p>Preparando cadastro...</p></div>
            ) : context ? (
              <form onSubmit={saveLead}>
                <div className="pipeline-add-lead-content">
                  {context.role === 'master' ? (
                    <label className="pipeline-add-lead-full">
                      Loja que receberá o lead
                      <select value={form.store_id} onChange={(event) => update('store_id', event.target.value)} required>
                        <option value="">Selecione a loja</option>
                        {context.stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="pipeline-add-lead-store pipeline-add-lead-full">
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

                  <label>
                    Veículo de interesse
                    <input value={form.interested_vehicle} onChange={(event) => update('interested_vehicle', event.target.value)} placeholder="Ex: HB20 2025" />
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

                  <label className="pipeline-add-lead-full">
                    Observações
                    <textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Informações importantes sobre o atendimento, entrada, troca ou preferência do cliente." />
                  </label>

                  {message ? (
                    <div className={`pipeline-add-lead-message pipeline-add-lead-full ${success ? 'is-success' : ''}`}>
                      {success ? <CheckCircle2 size={18} /> : null}<span>{message}</span>
                    </div>
                  ) : null}
                </div>

                <footer>
                  <button type="button" className="pipeline-add-lead-cancel" onClick={closeModal} disabled={saving}>Fechar</button>
                  <button type="submit" className="pipeline-add-lead-save" disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                    {saving ? 'Adicionando...' : 'Adicionar Lead'}
                  </button>
                </footer>
              </form>
            ) : (
              <div className="pipeline-add-lead-error">
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
  .pipeline-add-lead-button {
    position: fixed;
    z-index: 45;
    right: 22px;
    top: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 18px;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 16px;
    background: #dc2626;
    color: white;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 16px 35px rgba(220,38,38,.28);
    transition: transform .18s ease, background .18s ease;
  }
  .pipeline-add-lead-button:hover { background: #b91c1c; transform: translateY(-1px); }
  .pipeline-add-lead-overlay { position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(3,7,18,.76); backdrop-filter: blur(8px); }
  .pipeline-add-lead-modal { width: min(840px, 100%); max-height: 94vh; overflow: auto; border-radius: 28px; background: white; color: #18181b; box-shadow: 0 30px 100px rgba(0,0,0,.46); }
  .pipeline-add-lead-modal > header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid #e4e4e7; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); }
  .pipeline-add-lead-heading { display: flex; align-items: center; gap: 13px; }
  .pipeline-add-lead-icon { display: flex; width: 46px; height: 46px; align-items: center; justify-content: center; flex: none; border-radius: 16px; background: #fee2e2; color: #dc2626; }
  .pipeline-add-lead-heading p { margin: 0; color: #dc2626; font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
  .pipeline-add-lead-heading h2 { margin: 2px 0 0; font-size: 25px; line-height: 1.1; font-weight: 950; }
  .pipeline-add-lead-heading span { display: block; margin-top: 4px; color: #71717a; font-size: 11px; font-weight: 700; }
  .pipeline-add-lead-close { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; flex: none; border: 0; border-radius: 999px; background: #f4f4f5; color: #52525b; }
  .pipeline-add-lead-content { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; padding: 22px; }
  .pipeline-add-lead-content label { display: block; color: #3f3f46; font-size: 12px; font-weight: 900; }
  .pipeline-add-lead-content input, .pipeline-add-lead-content select, .pipeline-add-lead-content textarea { display: block; width: 100%; margin-top: 7px; border: 1px solid #d4d4d8; border-radius: 15px; background: #fff; padding: 12px 13px; color: #18181b; font-size: 14px; font-weight: 650; outline: none; }
  .pipeline-add-lead-content input:focus, .pipeline-add-lead-content select:focus, .pipeline-add-lead-content textarea:focus { border-color: #dc2626; box-shadow: 0 0 0 4px rgba(220,38,38,.08); }
  .pipeline-add-lead-content textarea { min-height: 100px; resize: vertical; }
  .pipeline-add-lead-full { grid-column: 1 / -1; }
  .pipeline-add-lead-store { border: 1px solid #e4e4e7; border-radius: 17px; background: #fafafa; padding: 13px 15px; }
  .pipeline-add-lead-store small { display: block; color: #a1a1aa; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
  .pipeline-add-lead-store strong { display: block; margin-top: 3px; font-size: 15px; }
  .pipeline-add-lead-message { display: flex; align-items: center; gap: 8px; border-radius: 15px; background: #f4f4f5; padding: 12px 14px; color: #52525b; font-size: 13px; font-weight: 750; }
  .pipeline-add-lead-message.is-success { background: #ecfdf5; color: #047857; }
  .pipeline-add-lead-modal footer { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #e4e4e7; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); }
  .pipeline-add-lead-cancel, .pipeline-add-lead-save { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; padding: 0 18px; font-size: 13px; font-weight: 900; }
  .pipeline-add-lead-cancel { border: 1px solid #d4d4d8; background: white; color: #52525b; }
  .pipeline-add-lead-save { border: 1px solid #dc2626; background: #dc2626; color: white; }
  .pipeline-add-lead-save:disabled, .pipeline-add-lead-cancel:disabled { cursor: not-allowed; opacity: .6; }
  .pipeline-add-lead-loading, .pipeline-add-lead-error { display: flex; min-height: 300px; flex-direction: column; align-items: center; justify-content: center; gap: 13px; padding: 30px; color: #71717a; text-align: center; font-weight: 750; }
  .pipeline-add-lead-error button { border: 0; border-radius: 13px; background: #dc2626; padding: 11px 16px; color: white; font-weight: 900; }
  @media (max-width: 1023px) {
    .pipeline-add-lead-button { top: auto; right: 14px; bottom: 86px; min-height: 48px; border-radius: 999px; padding: 0 17px; }
  }
  @media (max-width: 640px) {
    .pipeline-add-lead-overlay { align-items: flex-end; padding: 0; }
    .pipeline-add-lead-modal { max-height: 94vh; border-radius: 26px 26px 0 0; }
    .pipeline-add-lead-content { grid-template-columns: 1fr; padding: 18px; }
    .pipeline-add-lead-full { grid-column: auto; }
    .pipeline-add-lead-modal footer { padding: 13px 18px max(13px, env(safe-area-inset-bottom)); }
    .pipeline-add-lead-cancel, .pipeline-add-lead-save { flex: 1; padding: 0 12px; }
  }
`;
