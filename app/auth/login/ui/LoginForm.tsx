"use client";

import { useMemo, useState, useTransition } from "react";

type LoginState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length > 0 && state.status !== "submitting";
  }, [email, password, state.status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState({ status: "submitting" });

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setState({ status: "error", message: payload?.error ?? "Falha ao entrar" });
      return;
    }

    startTransition(async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ user: null }));

      if (me?.user?.role === "SCHOOL") {
        window.location.href = "/admin/people-analytics";
        return;
      }
      window.location.href = "/student/projects";
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Email</span>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@escola.com"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Senha</span>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      {state.status === "error" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Entrar
      </button>
    </form>
  );
}
