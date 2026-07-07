export function DashboardFilterCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm">
      {label}
      {children}
    </label>
  );
}
