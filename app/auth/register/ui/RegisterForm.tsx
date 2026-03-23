"use client";

import { useMemo, useState, useTransition } from "react";

type RegisterState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export default function RegisterForm({ defaultRole }: { defaultRole?: "STUDENT" | "SCHOOL" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"STUDENT" | "SCHOOL">(defaultRole ?? "STUDENT");
  const [state, setState] = useState<RegisterState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      email.trim().length > 3 &&
      password.length >= 8 &&
      state.status !== "submitting"
    );
  }, [email, name, password.length, state.status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState({ status: "submitting" });

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setState({ status: "error", message: payload?.error ?? "Falha ao cadastrar" });
      return;
    }

    startTransition(() => {
      window.location.href = role === "SCHOOL" ? "/admin/people-analytics" : "/student/projects";
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Nome</span>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          autoComplete="name"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Email</span>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@escola.com"
          autoComplete="email"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Senha (mín. 8)</span>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">Tipo de acesso</span>
        <select
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
          value={role}
          onChange={(e) => setRole(e.target.value as "STUDENT" | "SCHOOL")}
        >
          <option value="STUDENT">Aluno</option>
          <option value="SCHOOL">Escola (gestão)</option>
        </select>
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
        Criar conta
      </button>
    </form>
  );
}
