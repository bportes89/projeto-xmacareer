"use client";

import { useState, useTransition } from "react";

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <div className="text-xs text-rose-700">{error}</div> : null}
      <button
        type="button"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-orange px-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            if (!res || !res.ok) {
              setError("Falha ao sair");
              return;
            }
            window.location.href = "/";
          });
        }}
      >
        Sair
      </button>
    </div>
  );
}
