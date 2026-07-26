'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Check, Copy, KeyRound, Loader2, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  role: 'pre_sales',
  receives_leads: true,
  routing_order: '0',
  max_open_leads: ''
};

const roleLabels: Record<string, string> = {
  pre_sales: 'SDR / Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

type CreatedAccess = {
  full_name: string;
  email: string;
  role: string;
  role_label: string;
  temporary_password: string;
};

function refreshTeamPage() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    String(item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === 'atualizar'
  );
  button?.click();
}

export function StoreTeamManualMember() {
  const pathname = usePathname() || '';
  const match = pathname.match(/^\/loja\/([^/]+)\/equipe\/?$/);
  const active = Boolean(match);
  const slug = match?.[1] || '';
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<CreatedAccess | null>(null);
  const [form, setForm] = useState(emptyForm);

  function update(field: keyof typeof emptyForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setMessage('');
    setCopied(false);
    setCreated(null);
    setForm(emptyForm);
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setMessage('Criando acesso e vinculando à loja...');
    setCreated(null);
    setCopied(false);

    try {
      const token = await getToken();
      const response = await fetch('/api/store/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          slug,
          action: 'create_member',
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          role: form.role,
          receives_leads: form.receives_leads,
          routing_order: form.routing_order,
          max_open_leads: form.max_open_leads
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar o colaborador.');

      setCreated({
        full_name: payload.member.full_name,
        email: payload.member.email,
        role: payload.member.role,
        role_label: payload.role_label || roleLabels[payload.member.role] || payload.member.role,
        temporary_password: payload.temporary_password
      });
      setMessage(payload.message || 'Colaborador criado com sucesso.');
      setForm(emptyForm);
      window.setTimeout(refreshTeamPage, 200);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível criar o colaborador.');
    } finally {
      setSaving(false);
    }
  }

  async function copyAccess() {
    if (!created) return;
    const text = `Acesso ao Auto Controle Automotivo\nE-mail: ${created.email}\nSenha temporária: ${created.temporary_password}\nNo primeiro acesso, o sistema solicitará uma nova senha.`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!active) return null;

  return (
    <>
      <style>{styles}</style>
      <button type="button" className="team-manual-add-trigger" onClick={() => setOpen(true)}>
        <UserPlus size={19} /> Adicionar membro
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div className="team-manual-overlay" role="dialog" aria-modal="true" aria-label="Adicionar membro manualmente" onMouseDown={closeModal}>
          <section className="team-manual-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className="team-manual-heading">
                <div className="team-manual-icon"><UserPlus size={22} /></div>
                <div>
                  <p>Cadastro direto</p>
                  <h2>Adicionar membro</h2>
                  <span>O acesso será criado ativo e vinculado a esta loja.</span>
                </div>
              </div>
              <button type="button" className="team-manual-close" onClick={closeModal} disabled={saving} aria-label="Fechar"><X size={20} /></button>
            </header>

            {created ? (
              <div className="team-manual-success">
                <div className="team-manual-success-icon"><KeyRound size={27} /></div>
                <p className="team-manual-eyebrow">Acesso criado com sucesso</p>
                <h3>{created.full_name}</h3>
                <span>{created.role_label}</span>

                <div className="team-manual-credentials">
                  <label>E-mail<strong>{created.email}</strong></label>
                  <label>Senha temporária<strong>{created.temporary_password}</strong></label>
                </div>

                <div className="team-manual-warning">
                  Copie a senha agora. Ela não será exibida novamente. No primeiro login, o colaborador deverá criar uma nova senha.
                </div>

                <button type="button" className="team-manual-copy" onClick={() => void copyAccess()}>
                  {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Acesso copiado' : 'Copiar e-mail e senha'}
                </button>
                <button type="button" className="team-manual-finish" onClick={closeModal}>Concluir</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="team-manual-content">
                  <label className="team-manual-full">Nome completo<input value={form.full_name} onChange={(event) => update('full_name', event.target.value)} placeholder="Nome do colaborador" required minLength={3} /></label>
                  <label>E-mail de acesso<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="colaborador@empresa.com" required autoComplete="off" /></label>
                  <label>Telefone<input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="(61) 99999-9999" inputMode="tel" /></label>

                  <label>Cargo<select value={form.role} onChange={(event) => update('role', event.target.value)}>
                    <option value="pre_sales">SDR / Pré-vendas</option>
                    <option value="seller">Vendedor</option>
                    <option value="prospector">Prospectador</option>
                  </select></label>

                  <label>Ordem no rodízio<input type="number" min={0} max={9999} value={form.routing_order} onChange={(event) => update('routing_order', event.target.value)} /></label>
                  <label className="team-manual-full">Limite de leads em aberto<input type="number" min={1} value={form.max_open_leads} onChange={(event) => update('max_open_leads', event.target.value)} placeholder="Deixe vazio para não limitar" /></label>

                  <label className="team-manual-routing team-manual-full">
                    <div><strong>Receber leads automaticamente</strong><span>O colaborador entra ativo no rodízio deste cargo.</span></div>
                    <input type="checkbox" checked={form.receives_leads} onChange={(event) => update('receives_leads', event.target.checked)} />
                  </label>

                  {message ? <div className="team-manual-message team-manual-full">{message}</div> : null}
                </div>

                <footer>
                  <button type="button" className="team-manual-cancel" onClick={closeModal} disabled={saving}>Cancelar</button>
                  <button type="submit" className="team-manual-save" disabled={saving}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                    {saving ? 'Criando acesso...' : 'Criar membro ativo'}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}

const styles = `
  .team-manual-add-trigger{position:fixed;right:28px;bottom:24px;z-index:45;display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:18px;background:#e11d2e;color:#fff;padding:14px 20px;font-size:14px;font-weight:900;box-shadow:0 18px 45px rgba(225,29,46,.28);transition:.2s}
  .team-manual-add-trigger:hover{transform:translateY(-2px);background:#c91526}
  .team-manual-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.74);padding:14px;backdrop-filter:blur(8px)}
  .team-manual-modal{width:min(720px,100%);max-height:94dvh;overflow:auto;border-radius:30px;background:#fff;box-shadow:0 35px 90px rgba(0,0,0,.4);color:#0f172a}
  .team-manual-modal>header{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,.97);padding:22px 24px}
  .team-manual-heading{display:flex;align-items:flex-start;gap:13px}.team-manual-icon{display:flex;width:46px;height:46px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:16px;background:#fee2e2;color:#dc2626}
  .team-manual-heading p,.team-manual-eyebrow{margin:0;color:#dc2626;font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.team-manual-heading h2{margin:4px 0 0;font-size:26px;font-weight:950}.team-manual-heading span{display:block;margin-top:3px;color:#64748b;font-size:13px}
  .team-manual-close{display:flex;width:40px;height:40px;align-items:center;justify-content:center;border:0;border-radius:999px;background:#f1f5f9;color:#64748b}.team-manual-close:hover{background:#e2e8f0}
  .team-manual-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px}.team-manual-content label{display:block;color:#334155;font-size:13px;font-weight:850}.team-manual-content input,.team-manual-content select{width:100%;margin-top:8px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;padding:13px 14px;color:#0f172a;font-size:14px;outline:none}.team-manual-content input:focus,.team-manual-content select:focus{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.1)}.team-manual-full{grid-column:1/-1}
  .team-manual-routing{display:flex!important;align-items:center;justify-content:space-between;gap:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;padding:16px}.team-manual-routing strong{display:block;color:#0f172a}.team-manual-routing span{display:block;margin-top:3px;color:#64748b;font-size:12px;font-weight:600}.team-manual-routing input{width:21px;height:21px;margin:0;accent-color:#dc2626}
  .team-manual-message{border-radius:16px;background:#fff7ed;padding:13px 15px;color:#9a3412;font-size:13px;font-weight:750}
  .team-manual-modal form>footer{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;padding:18px 24px}.team-manual-cancel,.team-manual-save,.team-manual-copy,.team-manual-finish{display:inline-flex;min-height:46px;align-items:center;justify-content:center;gap:8px;border-radius:15px;padding:11px 18px;font-size:14px;font-weight:900}.team-manual-cancel{border:1px solid #cbd5e1;background:#fff;color:#475569}.team-manual-save,.team-manual-copy{border:0;background:#dc2626;color:#fff}.team-manual-save:disabled{opacity:.6}.team-manual-finish{border:1px solid #cbd5e1;background:#fff;color:#334155}
  .team-manual-success{padding:30px;text-align:center}.team-manual-success-icon{display:flex;width:62px;height:62px;margin:0 auto 16px;align-items:center;justify-content:center;border-radius:22px;background:#dcfce7;color:#16a34a}.team-manual-success h3{margin:7px 0 3px;font-size:28px;font-weight:950}.team-manual-success>span{color:#64748b;font-size:14px;font-weight:750}.team-manual-credentials{display:grid;gap:10px;margin-top:24px;text-align:left}.team-manual-credentials label{border:1px solid #e2e8f0;border-radius:17px;background:#f8fafc;padding:13px 15px;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.team-manual-credentials strong{display:block;margin-top:5px;color:#0f172a;font-size:16px;letter-spacing:normal;text-transform:none;word-break:break-all}.team-manual-warning{margin:16px 0;border-radius:16px;background:#fff7ed;padding:14px;color:#9a3412;font-size:13px;font-weight:750}.team-manual-copy,.team-manual-finish{width:100%;margin-top:8px}
  @media(max-width:640px){.team-manual-add-trigger{right:14px;bottom:14px}.team-manual-content{grid-template-columns:1fr;padding:18px}.team-manual-full{grid-column:auto}.team-manual-modal>header{padding:18px}.team-manual-modal form>footer{flex-direction:column-reverse;padding:16px}.team-manual-cancel,.team-manual-save{width:100%}}
`;
