'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, Car, CheckCircle2, FileSpreadsheet, Link as LinkIcon, LockKeyhole, Upload } from 'lucide-react';

const emptyLinks = ['', '', '', '', '', ''];

export default function StoreSelfRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params?.token || '');

  const [eventInfo, setEventInfo] = useState<any>(null);
  const [vehicleLinks, setVehicleLinks] = useState(emptyLinks);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('Carregando cadastro da loja...');
  const [form, setForm] = useState({
    storeName: '',
    responsibleName: '',
    phone: '',
    email: '',
    password: '',
    websiteUrl: ''
  });

  async function loadRegistration() {
    const response = await fetch(`/api/store-self-registration?token=${encodeURIComponent(token)}`);
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || 'Link de cadastro inválido.');
      setLoading(false);
      return;
    }

    setEventInfo(result.event);
    setMessage('');
    setLoading(false);
  }

  useEffect(() => {
    loadRegistration().catch(() => {
      setMessage('Não foi possível carregar o link de cadastro.');
      setLoading(false);
    });
  }, [token]);

  function updateVehicleLink(index: number, value: string) {
    setVehicleLinks((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setMessage('Finalizando cadastro da loja...');

    const formData = new FormData();
    formData.append('token', token);
    formData.append('store_name', form.storeName);
    formData.append('responsible_name', form.responsibleName);
    formData.append('phone', form.phone);
    formData.append('email', form.email);
    formData.append('password', form.password);
    formData.append('website_url', form.websiteUrl);

    vehicleLinks.forEach((link, index) => {
      formData.append(`vehicle_url_${index + 1}`, link);
    });

    if (stockFile) {
      formData.append('stock_file', stockFile);
    }

    const response = await fetch('/api/store-self-registration', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível concluir o cadastro.');
      return;
    }

    setMessage('Cadastro concluído. Redirecionando para o login da loja...');
    router.replace(result.login_url || '/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070A12] p-6 text-center text-white">
        <p className="text-sm font-bold text-zinc-400">{message}</p>
      </main>
    );
  }

  if (!eventInfo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070A12] p-6 text-center text-white">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-7">
          <h1 className="text-2xl font-black">Link indisponível</h1>
          <p className="mt-3 text-sm text-zinc-400">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070A12] px-5 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-red-500">Cadastro de Loja</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Participe do evento</h1>
          <p className="mt-3 text-base text-zinc-300">
            Preencha os dados da sua loja, crie sua senha e envie até 6 links de veículos para aparecerem no portal do evento.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-bold text-zinc-400">Evento</p>
            <strong className="mt-1 block text-xl text-white">{eventInfo.event_name}</strong>
          </div>
        </div>

        <form onSubmit={submitRegistration} className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-[30px] border border-white/10 bg-white p-6 text-[#101828] shadow-2xl shadow-black/30">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Dados da loja</h2>
                <p className="text-sm text-zinc-500">Esses dados serão usados para criar o portal da loja.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input
                className="premium-input"
                placeholder="Nome da loja"
                value={form.storeName}
                onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                required
              />

              <input
                className="premium-input"
                placeholder="Nome do responsável"
                value={form.responsibleName}
                onChange={(e) => setForm({ ...form, responsibleName: e.target.value })}
                required
              />

              <input
                className="premium-input"
                placeholder="Telefone / WhatsApp"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />

              <input
                className="premium-input"
                type="email"
                placeholder="E-mail para login"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  className="premium-input pl-11"
                  type="password"
                  placeholder="Criar senha de acesso"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>

              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  className="premium-input pl-11"
                  placeholder="Link do site da loja"
                  value={form.websiteUrl}
                  onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-bold text-zinc-600">
                <FileSpreadsheet size={20} />
                <span className="min-w-0 flex-1">
                  {stockFile ? stockFile.name : 'Importar estoque XML ou CSV'}
                </span>
                <Upload size={18} />
                <input
                  className="hidden"
                  type="file"
                  accept=".csv,.xml,text/csv,text/xml,application/xml"
                  onChange={(e) => setStockFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white p-6 text-[#101828] shadow-2xl shadow-black/30">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white">
                <Car size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Veículos para o evento</h2>
                <p className="text-sm text-zinc-500">Adicione seus carros no portal do evento para receber leads.</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-red-50 p-4">
              <p className="text-sm font-bold text-red-700">
                Cole abaixo até 6 links públicos dos anúncios dos seus veículos.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              {vehicleLinks.map((link, index) => (
                <input
                  key={index}
                  className="premium-input"
                  placeholder={`Link do veículo ${index + 1}`}
                  value={link}
                  onChange={(e) => updateVehicleLink(index, e.target.value)}
                />
              ))}
            </div>

            <button className="premium-button-primary mt-5 w-full justify-center" type="submit" disabled={submitting}>
              <CheckCircle2 size={18} />
              {submitting ? 'Finalizando cadastro...' : 'Finalizar cadastro da loja'}
            </button>

            {message ? (
              <p className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">
                {message}
              </p>
            ) : null}
          </section>
        </form>
      </section>
    </main>
  );
}
