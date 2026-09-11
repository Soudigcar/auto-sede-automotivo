'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

type MemberOffboardingActionProps = {
  memberId: string;
  memberName: string;
  busy: boolean;
  onOffboard: (memberId: string, confirmation: string) => Promise<void>;
};

export default function MemberOffboardingAction({
  memberId,
  memberName,
  busy,
  onOffboard
}: MemberOffboardingActionProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim().toUpperCase() === 'EXCLUIR';

  async function submit() {
    if (!confirmed || busy) return;
    await onOffboard(memberId, 'EXCLUIR');
    setConfirmation('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={16} /> Excluir da equipe
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-red-950">Excluir {memberName} desta equipe?</p>
          <p className="mt-1 text-xs leading-relaxed text-red-900/75">
            O acesso à loja será encerrado e o colaborador deixará de receber leads. O histórico comercial não será apagado e a identidade poderá ser transferida com segurança para outra loja por um novo convite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setConfirmation(''); }}
          disabled={busy}
          className="rounded-lg p-1 text-red-700 hover:bg-red-100 disabled:opacity-50"
          aria-label="Cancelar exclusão"
        >
          <X size={17} />
        </button>
      </div>

      <label className="mt-4 block text-xs font-black uppercase tracking-wide text-red-800">
        Digite EXCLUIR para confirmar
        <input
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
          autoComplete="off"
          className="premium-input mt-2 border-red-200 text-sm normal-case"
          placeholder="EXCLUIR"
        />
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setConfirmation(''); }}
          disabled={busy}
          className="premium-button-secondary justify-center text-sm disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!confirmed || busy}
          className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          {busy ? 'Excluindo...' : 'Confirmar exclusão'}
        </button>
      </div>
    </div>
  );
}
