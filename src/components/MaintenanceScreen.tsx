import { Logo } from "./Logo";

export function MaintenanceScreen({ message }: { message: string | null }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-safe text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-3xl"
      />
      <div className="relative flex max-w-sm animate-slide-up flex-col items-center gap-5">
        <Logo size="lg" />
        <div className="glass rounded-3xl px-6 py-5">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-zinc-100">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
            Lagi istirahat
          </p>
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">
            {message?.trim() || "Daget lagi berhenti sebentar. Balik lagi nanti ya 👋"}
          </p>
        </div>
      </div>
    </main>
  );
}
