'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle2, UserPlus } from 'lucide-react';

const roleLabels: Record<string, string> = {
  pre_sales: 'Pré-vendas',
  seller: 'Vendedor',
  prospector: 'Prospectador'
};

function TeamRegistrationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [context, setContext] = useState<any>(null);
  const [message, setMessage] = useState('Validando link...');
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm_password: '' });

  useEffect(() => {
    fetch(`/api/store/team-register?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Link inválido.');
        setContext(data);
        setMessage('');
      })
      .catch((error) => setMessage(error.message));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirm_password) {
      setMessage('As senhas não coincidem.');
      return;
    }
    setMessage('Criando seu acesso...');
    const response = await fetch('/api/store/team-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...form })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Não foi possível concluir o cadastro.');
      return;
    }
    setDone(true);
    setMessage(data.message || 'Cadastro concluído.');
  }

  return (
    <main className="min-h-screen bg-[#071020] px-5 py-10 text-white">
      <section className="mx-auto max-w-2xl rounded-[32px] border border-white/10 bg-white/[0.05] p-6 shadow-2xl md:p-9">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600"><UserPlus size={24} /></div><div><p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">Auto Controle Automotivo</p><h1 className="text-3xl font-black">Cadastro da equipe</h1></div></div>
        {context ? <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="flex items-center gap-2 font-black"><Building2 size={18} /> {context.store.name}</p><p className="mt-1 text-sm text-zinc-400">Cargo autorizado: {roleLabels[context.role] || context.role}</p></div> : null}
        {done ? <div className="mt-8 text-center"><CheckCircle2 className="mx-auto text-emerald-400" size={56} /><h2 className="mt-4 text-2xl font-black">Acesso criado</h2><p className="mt-2 text-zinc-300">{message}</p><Link href="/login" className="mt-6 inline-flex rounded-2xl bg-red-600 px-6 py-4 font-black">Entrar no sistema</Link></div> : context ? <form onSubmit={submit} className="mt-7 grid gap-4"><Input label="Nome completo" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} /><Input label="E-mail" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><Input label="Telefone / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><div className="grid gap-4 md:grid-cols-2"><Input label="Senha" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} /><Input label="Confirmar senha" type="password" value={form.confirm_password} onChange={(value) => setForm({ ...form, confirm_password: value })} /></div><p className="text-xs text-zinc-400">A senha deve ter pelo menos 8 caracteres. O acesso ao rodízio será liberado pelo gestor da loja.</p><button className="rounded-2xl bg-red-600 px-5 py-4 font-black shadow-lg shadow-red-600/20" type="submit">Criar meu acesso</button></form> : null}
        {message && !done ? <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm text-zinc-200">{message}</div> : null}
      </section>
    </main>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm font-bold text-zinc-200">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-red-500" /></label>;
}

export default function TeamRegistrationPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#071020] text-white">Validando link...</main>}><TeamRegistrationContent /></Suspense>;
}
