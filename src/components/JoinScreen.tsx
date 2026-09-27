"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { USERNAME_MAX } from "@/lib/constants";
import { cn, friendlyError, normalizeUsername, validateUsername } from "@/lib/utils";
import { Logo } from "./Logo";

interface JoinScreenProps {
  mode: "join" | "rename";
  initialUsername: string;
  initialError?: string | null;
  onSubmit: (username: string) => Promise<void>;
  onCancel?: () => void;
}

export function JoinScreen({ mode, initialUsername, initialError, onSubmit, onCancel }: JoinScreenProps) {
  const [value, setValue] = useState(initialUsername);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const name = normalizeUsername(value);
    const invalid = validateUsername(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (mode === "rename" && name === initialUsername) {
      onCancel?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
    } catch (err) {
      setError(friendlyError(err, "Gagal masuk. Coba lagi."));
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 pb-safe">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-3xl"
      />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <p className="text-sm text-zinc-500">
            {mode === "rename" ? "Pilih username baru kamu." : "Ruang obrolan komunitas, live."}
          </p>
        </div>

        <form onSubmit={submit} className="glass rounded-3xl p-2 shadow-2xl shadow-black/40" noValidate>
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id="username"
              name="username"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              maxLength={USERNAME_MAX + 8}
              autoComplete="nickname"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="Username"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "username-error" : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent px-4 text-base text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-zinc-50 px-5 text-sm font-semibold text-zinc-950 transition",
                "hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : mode === "rename" ? "Simpan" : "Masuk"}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </form>

        <div className="mt-3 min-h-[20px] px-2 text-center text-sm">
          {error ? (
            <p id="username-error" role="alert" className="text-red-300/90">
              {error}
            </p>
          ) : (
            <p className="text-zinc-600">Tanpa daftar. Tanpa password.</p>
          )}
        </div>

        {onCancel && (
          <button type="button" onClick={onCancel} className="mx-auto mt-4 block text-sm text-zinc-500 transition hover:text-zinc-200">
            Batal
          </button>
        )}
      </div>
    </main>
  );
}
