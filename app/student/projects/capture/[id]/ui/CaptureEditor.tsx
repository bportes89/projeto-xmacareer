"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type ProjectStatus = "DRAFT" | "SUBMITTED";

type Evidence = { label: string; url: string };

type EvidenceFileDTO = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  uploadedBy?: { id: string; name: string; email: string };
  downloadUrl: string;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: Date }
  | { status: "error"; message: string };

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** idx;
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

function normalizeUrl(value: string) {
  const clean = value.trim();
  if (!clean.length) return null;
  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

function normalizeEvidences(value: Evidence[]) {
  return value
    .map((e) => ({
      label: typeof e.label === "string" ? e.label.trim() : "",
      url: typeof e.url === "string" ? normalizeUrl(e.url) ?? "" : "",
    }))
    .filter((e) => e.label.length > 0 && e.url.length > 0)
    .slice(0, 20);
}

type Scored = { name: string; score: number };

function toScoredArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const name = (x as { name?: unknown }).name;
      const score = (x as { score?: unknown }).score;
      return {
        name: typeof name === "string" ? name : "",
        score: typeof score === "number" ? score : 0,
      };
    })
    .filter((x) => x.name.trim().length > 0)
    .slice(0, 12);
}

export default function CaptureEditor({
  projectId,
  canEdit,
  initialProject,
}: {
  projectId: string;
  canEdit: boolean;
  initialProject: {
    title: string;
    situation: string;
    confirmedCompetencies?: unknown;
    evidences: Evidence[];
    status: ProjectStatus;
    updatedAt: string;
  };
}) {
  const [title, setTitle] = useState(initialProject.title ?? "");
  const [situation, setSituation] = useState(initialProject.situation ?? "");
  const [evidences, setEvidences] = useState<Evidence[]>(initialProject.evidences ?? []);
  const [status, setStatus] = useState<ProjectStatus>(initialProject.status);
  const [confirmedCompetencies, setConfirmedCompetencies] = useState<{ hard: string[]; soft: string[]; areas: string[] }>(() => {
    const v = initialProject.confirmedCompetencies as
      | { hard?: unknown; soft?: unknown; areas?: unknown }
      | null
      | undefined;
    const hard = Array.isArray(v?.hard) ? v!.hard.filter((x): x is string => typeof x === "string") : [];
    const soft = Array.isArray(v?.soft) ? v!.soft.filter((x): x is string => typeof x === "string") : [];
    const areas = Array.isArray(v?.areas) ? v!.areas.filter((x): x is string => typeof x === "string") : [];
    return { hard: Array.from(new Set(hard)), soft: Array.from(new Set(soft)), areas: Array.from(new Set(areas)) };
  });

  const [saveState, setSaveState] = useState<SaveState>({ status: "saved", at: new Date(initialProject.updatedAt) });
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const lastSentPayload = useRef<string>("");
  const lastServerUpdatedAt = useRef<number>(new Date(initialProject.updatedAt).getTime());
  const debounceTimer = useRef<number | null>(null);

  const payload = useMemo(() => {
    return {
      title: title.trim().slice(0, 200),
      situation: situation.trim().slice(0, 4000),
      evidences: normalizeEvidences(evidences),
      confirmedCompetencies: {
        hard: Array.from(new Set(confirmedCompetencies.hard)).slice(0, 30),
        soft: Array.from(new Set(confirmedCompetencies.soft)).slice(0, 30),
        areas: Array.from(new Set(confirmedCompetencies.areas)).slice(0, 30),
      },
    };
  }, [confirmedCompetencies.areas, confirmedCompetencies.hard, confirmedCompetencies.soft, evidences, situation, title]);

  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const situationCount = situation.trim().length;
  const isShallowSituation = situationCount > 0 && situationCount < 80;
  const [rewriteIsLoading, setRewriteIsLoading] = useState(false);
  const [rewriteSuggestion, setRewriteSuggestion] = useState<string | null>(null);
  const [rewriteAiScore, setRewriteAiScore] = useState<number | null>(null);
  const [rewriteAiMissing, setRewriteAiMissing] = useState<string[]>([]);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  async function rewriteSituation(nonce: number) {
    if (!canWrite) return;
    setRewriteError(null);
    setRewriteIsLoading(true);
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, field: "situation", text: situation.slice(0, 4000), nonce }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setRewriteIsLoading(false);
      setRewriteError("Falha ao gerar sugestão");
      return;
    }

    const payload = (await res.json().catch(() => null)) as
      | { suggestion?: string; score?: number; missing?: string[] }
      | null;
    setRewriteSuggestion(payload?.suggestion ?? null);
    setRewriteAiScore(typeof payload?.score === "number" ? payload.score : null);
    setRewriteAiMissing(Array.isArray(payload?.missing) ? payload.missing : []);
    setRewriteIsLoading(false);
  }

  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFileDTO[]>([]);
  const [evidenceFileToUpload, setEvidenceFileToUpload] = useState<File | null>(null);
  const [evidenceFilesSaveState, setEvidenceFilesSaveState] = useState<SaveState>({ status: "idle" });

  const [analysisPreview, setAnalysisPreview] = useState<{
    competenciesHard: Scored[];
    competenciesSoft: Scored[];
    areas: Scored[];
    updatedAt: string;
  } | null>(null);
  const [analysisSaveState, setAnalysisSaveState] = useState<SaveState>({ status: "idle" });

  async function analyzeNow() {
    if (!canWrite) return;
    setAnalysisSaveState({ status: "saving" });
    const res = await fetch("/api/ai/analyze-project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setAnalysisSaveState({ status: "error", message: "Não foi possível analisar" });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      competenciesHard?: unknown;
      competenciesSoft?: unknown;
      areas?: unknown;
      updatedAt?: unknown;
    } | null;
    const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
    setAnalysisPreview({
      competenciesHard: toScoredArray(data?.competenciesHard),
      competenciesSoft: toScoredArray(data?.competenciesSoft),
      areas: toScoredArray(data?.areas),
      updatedAt,
    });
    setAnalysisSaveState({ status: "saved", at: new Date(updatedAt) });
  }

  type ParticipantRole = "MENTOR" | "PEER" | "MANAGER";
  type ParticipantDTO = {
    id: string;
    role: ParticipantRole;
    createdAt: string;
    user: { id: string; name: string; email: string; role: string };
  };
  type InviteDTO = {
    id: string;
    email: string;
    role: ParticipantRole;
    createdAt: string;
    expiresAt: string;
  };
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ParticipantRole>("PEER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/participants`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { participants?: ParticipantDTO[]; invites?: InviteDTO[]; inviteLink?: string }
        | null;
      setParticipants(Array.isArray(data?.participants) ? data!.participants! : []);
      setInvites(Array.isArray(data?.invites) ? data!.invites! : []);
      setInviteLink(typeof data?.inviteLink === "string" ? data!.inviteLink! : null);
    };
    void load();
  }, [projectId]);

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!canEdit) return;
    if (statusRef.current === "SUBMITTED") return;

    const nextSerialized = JSON.stringify(payload);
    if (nextSerialized === lastSentPayload.current) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      startTransition(async () => {
        const serialized = JSON.stringify(payloadRef.current);
        if (serialized === lastSentPayload.current) {
          setSaveState({ status: "idle" });
          return;
        }

        lastSentPayload.current = serialized;
        setSaveState({ status: "saving" });
        saveStateRef.current = { status: "saving" };

        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: serialized,
        }).catch(() => null);

        if (!res) {
          setSaveState({ status: "error", message: "Sem conexão para salvar" });
          return;
        }
        if (res.status === 409) {
          setStatus("SUBMITTED");
          setSaveState({ status: "error", message: "Experiência já enviada (somente leitura)" });
          return;
        }
        if (!res.ok) {
          setSaveState({ status: "error", message: "Não foi possível salvar o rascunho" });
          return;
        }

        const data = (await res.json().catch(() => null)) as { updatedAt?: string } | null;
        const updatedAt = typeof data?.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
        lastServerUpdatedAt.current = new Date(updatedAt).getTime();
        setSaveState({ status: "saved", at: new Date(updatedAt) });
      });
    }, 800);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [canEdit, payload, projectId]);

  useEffect(() => {
    const loadFiles = async () => {
      const res = await fetch(`/api/projects/${projectId}/evidence-files`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as { files?: EvidenceFileDTO[] } | null;
      setEvidenceFiles(Array.isArray(data?.files) ? data.files : []);
    };
    void loadFiles();
  }, [projectId]);

  useEffect(() => {
    if (statusRef.current === "SUBMITTED") return;
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;

    let es: EventSource | null = null;
    let stopped = false;
    let reconnectTimer: number | null = null;

    const fetchIfSafe = async () => {
      if (statusRef.current === "SUBMITTED") return;
      const serialized = JSON.stringify(payloadRef.current);
      const isDirty = serialized !== lastSentPayload.current;
      if (isDirty) return;
      if (saveStateRef.current.status === "saving") return;

      const res = await fetch(`/api/projects/${projectId}`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;

      const raw = (await res.json().catch(() => null)) as
        | { title?: string; situation?: string; evidences?: unknown; status?: ProjectStatus; updatedAt?: string }
        | null;
      if (!raw || typeof raw.updatedAt !== "string") return;

      const serverTs = new Date(raw.updatedAt).getTime();
      if (serverTs <= lastServerUpdatedAt.current) return;

      const next: {
        title: string;
        situation: string;
        evidences: Evidence[];
        status: ProjectStatus;
        updatedAt: string;
      } = {
        title: typeof raw.title === "string" ? raw.title : "",
        situation: typeof raw.situation === "string" ? raw.situation : "",
        evidences: Array.isArray(raw.evidences)
          ? raw.evidences
              .filter((x) => x && typeof x === "object")
              .map((x) => ({
                label: typeof (x as { label?: unknown }).label === "string" ? String((x as { label?: unknown }).label) : "",
                url: typeof (x as { url?: unknown }).url === "string" ? String((x as { url?: unknown }).url) : "",
              }))
              .filter((e) => e.label.trim().length > 0 && e.url.trim().length > 0)
              .slice(0, 20)
          : [],
        status: raw.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
        updatedAt: raw.updatedAt,
      };

      setStatus(next.status);
      setTitle(next.title);
      setSituation(next.situation);
      setEvidences(next.evidences);
      lastServerUpdatedAt.current = new Date(next.updatedAt).getTime();
      lastSentPayload.current = JSON.stringify({
        title: next.title.trim().slice(0, 200),
        situation: next.situation.trim().slice(0, 4000),
        evidences: normalizeEvidences(next.evidences),
      });
      setSaveState({ status: "saved", at: new Date(next.updatedAt) });
    };

    const connect = () => {
      if (stopped) return;
      try {
        es = new EventSource(`/api/projects/${projectId}/events`);
      } catch {
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 2000);
        return;
      }

      es.addEventListener("ready", () => {
        void fetchIfSafe();
      });
      es.addEventListener("projectUpdated", () => {
        void fetchIfSafe();
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [projectId]);

  type RatingKey = "execution" | "collaboration" | "communication" | "leadership" | "ownership";
  type Ratings = Record<RatingKey, number>;
  const [ratings, setRatings] = useState<Ratings>({
    execution: 3,
    collaboration: 3,
    communication: 3,
    leadership: 3,
    ownership: 3,
  });
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaveState, setFeedbackSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/feedback`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | {
            myFeedback?: {
              ratings?: unknown;
              comment?: string | null;
            };
          }
        | null;
      const r = data?.myFeedback?.ratings as Partial<Ratings> | undefined;
      if (r) {
        setRatings((prev) => ({
          execution: Number(r.execution) || prev.execution,
          collaboration: Number(r.collaboration) || prev.collaboration,
          communication: Number(r.communication) || prev.communication,
          leadership: Number(r.leadership) || prev.leadership,
          ownership: Number(r.ownership) || prev.ownership,
        }));
      }
      setFeedbackComment(typeof data?.myFeedback?.comment === "string" ? data!.myFeedback!.comment! : "");
    };
    void load();
  }, [projectId]);

  const canWrite = canEdit && status !== "SUBMITTED";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-slate-900">Rascunho rápido</div>
            <div className="text-sm text-slate-600">
              Foque no essencial. Você pode completar STAR + D depois no modo completo.
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveState.status === "saving" ? (
              <div className="text-xs font-semibold text-slate-600">Salvando…</div>
            ) : saveState.status === "saved" ? (
              <div className="text-xs text-slate-500">
                Salvo{" "}
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(saveState.at)}
              </div>
            ) : saveState.status === "error" ? (
              <div className="text-xs font-semibold text-rose-700">{saveState.message}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-slate-900">Título</div>
            <input
              value={title}
              disabled={!canWrite}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Ex: Atendimento ao cliente no estágio"
            />
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">O que aconteceu?</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canWrite || rewriteIsLoading}
                  className="text-xs font-semibold text-brand-blue underline-offset-4 hover:text-brand-blue-hover hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={async () => {
                    await rewriteSituation(Date.now());
                  }}
                >
                  {rewriteIsLoading ? "Gerando…" : "Aprofundar com IA"}
                </button>
                {typeof rewriteAiScore === "number" ? (
                  <div className="text-xs font-semibold text-slate-700">IA {rewriteAiScore}/100</div>
                ) : null}
                <div className={isShallowSituation ? "text-xs font-semibold text-brand-orange" : "text-xs text-slate-500"}>
                  {Math.min(situation.length, 4000)}/4000
                </div>
              </div>
            </div>
            <textarea
              value={situation}
              disabled={!canWrite}
              onChange={(e) => setSituation(e.target.value)}
              className="min-h-[120px] w-full resize-y rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Descreva rapidamente o contexto, o que você fez e o resultado (pode ser em tópicos)."
            />
            {isShallowSituation ? (
              <div className="rounded-xl border border-brand-orange/30 bg-brand-orange/10 px-3 py-2 text-xs text-brand-orange">
                Resposta curta. Inclua pessoas envolvidas, prazo, ferramentas e algum indicador de resultado.
              </div>
            ) : null}
            {rewriteError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{rewriteError}</div>
            ) : null}
            {rewriteSuggestion ? (
              <div className="rounded-3xl border border-slate-300/70 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-semibold text-slate-900">Sugestão (você decide a versão final)</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canWrite || rewriteIsLoading}
                      className="inline-flex h-8 items-center justify-center rounded-xl border border-brand-orange/60 bg-white px-3 text-xs font-semibold text-brand-orange shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={async () => rewriteSituation(Date.now())}
                    >
                      Regenerar
                    </button>
                    <button
                      type="button"
                      disabled={!canWrite}
                      className="inline-flex h-8 items-center justify-center rounded-xl bg-brand-blue px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        setSituation(rewriteSuggestion);
                        setRewriteSuggestion(null);
                      }}
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-xl border border-brand-blue/50 bg-white px-3 text-xs font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
                      onClick={() => setRewriteSuggestion(null)}
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                {rewriteAiMissing.length ? (
                  <div className="mt-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                    <div className="font-semibold text-slate-900">O que pode faltar</div>
                    <div className="mt-1 flex flex-col gap-1">
                      {rewriteAiMissing.slice(0, 3).map((m) => (
                        <div key={m}>- {m}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-700">{rewriteSuggestion}</pre>
              </div>
            ) : null}
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Evidências</div>
            <div className="mt-1 text-sm text-slate-600">Adicione links e arquivos para comprovar a experiência.</div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-brand-blue hover:underline"
            onClick={async () => {
              if (typeof window === "undefined") return;
              try {
                await navigator.clipboard.writeText(window.location.href);
              } catch {
                return;
              }
            }}
          >
            Copiar link
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={evidenceLabel}
              disabled={!canWrite}
              onChange={(e) => setEvidenceLabel(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Ex: Print do resultado"
            />
            <input
              value={evidenceUrl}
              disabled={!canWrite}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="https://..."
              inputMode="url"
            />
            <button
              type="button"
              disabled={!canWrite}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                const label = evidenceLabel.trim().slice(0, 80);
                const url = normalizeUrl(evidenceUrl);
                if (!label || !url) return;
                setEvidences((prev) => normalizeEvidences([...prev, { label, url }]));
                setEvidenceLabel("");
                setEvidenceUrl("");
              }}
            >
              Adicionar
            </button>
          </div>

          {evidences.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {evidences.map((e, idx) => (
                <div
                  key={`${e.label}-${e.url}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 shadow-sm"
                >
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-sm font-semibold text-brand-blue hover:underline"
                    title={e.url}
                  >
                    {e.label}
                  </a>
                  {canWrite ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-700 hover:underline"
                      onClick={() => setEvidences((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600">Nenhuma evidência adicionada.</div>
          )}

          {canWrite ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="file"
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-brand-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-blue-hover"
                onChange={(e) => setEvidenceFileToUpload(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={!evidenceFileToUpload || isPending}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  if (!evidenceFileToUpload) return;
                  startTransition(async () => {
                    setEvidenceFilesSaveState({ status: "saving" });
                    const form = new FormData();
                    form.append("file", evidenceFileToUpload);
                    const res = await fetch(`/api/projects/${projectId}/evidence-files`, { method: "POST", body: form }).catch(
                      () => null,
                    );
                    if (!res || !res.ok) {
                      setEvidenceFilesSaveState({ status: "error", message: "Não foi possível enviar o arquivo" });
                      return;
                    }
                    const listRes = await fetch(`/api/projects/${projectId}/evidence-files`, { method: "GET" }).catch(() => null);
                    if (listRes && listRes.ok) {
                      const data = (await listRes.json().catch(() => null)) as { files?: EvidenceFileDTO[] } | null;
                      setEvidenceFiles(Array.isArray(data?.files) ? data.files : []);
                    }
                    setEvidenceFileToUpload(null);
                    setEvidenceFilesSaveState({ status: "saved", at: new Date() });
                  });
                }}
              >
                Enviar arquivo
              </button>
              {evidenceFilesSaveState.status === "error" ? (
                <div className="text-xs font-semibold text-rose-700">{evidenceFilesSaveState.message}</div>
              ) : null}
            </div>
          ) : null}

          {evidenceFiles.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {evidenceFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="min-w-0">
                    <a
                      href={f.downloadUrl}
                      className="block truncate text-sm font-semibold text-brand-blue hover:underline"
                      title={f.name}
                    >
                      {f.name}
                    </a>
                    <div className="mt-1 truncate text-xs text-slate-600">
                      {formatBytes(f.size)} •{" "}
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                        new Date(f.createdAt),
                      )}
                    </div>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-700 hover:underline"
                      onClick={() => {
                        startTransition(async () => {
                          await fetch(`/api/projects/${projectId}/evidence-files`, {
                            method: "DELETE",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ fileId: f.id }),
                          }).catch(() => null);
                          const listRes = await fetch(`/api/projects/${projectId}/evidence-files`, { method: "GET" }).catch(
                            () => null,
                          );
                          if (!listRes || !listRes.ok) return;
                          const data = (await listRes.json().catch(() => null)) as { files?: EvidenceFileDTO[] } | null;
                          setEvidenceFiles(Array.isArray(data?.files) ? data.files : []);
                        });
                      }}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600">Nenhum arquivo enviado.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Competências (IA)</div>
            <div className="mt-1 text-sm text-slate-600">
              Extraia um diagnóstico inicial agora e confirme com mais cuidado no modo completo.
            </div>
          </div>
          <button
            type="button"
            disabled={!canWrite || analysisSaveState.status === "saving"}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void analyzeNow();
            }}
          >
            {analysisSaveState.status === "saving" ? "Analisando…" : "Extrair"}
          </button>
        </div>

        {analysisSaveState.status === "error" ? (
          <div className="mt-2 text-xs font-semibold text-rose-700">{analysisSaveState.message}</div>
        ) : null}

        {analysisPreview ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="text-xs text-slate-500">
              Atualizado em{" "}
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                new Date(analysisPreview.updatedAt),
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold text-slate-900">Hard</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysisPreview.competenciesHard.slice(0, 6).map((c) => {
                    const active = confirmedCompetencies.hard.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        disabled={!canWrite}
                        title={`${c.score}/100`}
                        onClick={() => {
                          setConfirmedCompetencies((prev) => {
                            const has = prev.hard.includes(c.name);
                            const next = has ? prev.hard.filter((x) => x !== c.name) : [...prev.hard, c.name];
                            return { ...prev, hard: next.slice(0, 30) };
                          });
                        }}
                        className={
                          active
                            ? "rounded-full bg-brand-blue px-3 py-1 text-xs font-semibold text-white"
                            : "rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700"
                        }
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {analysisPreview.competenciesHard.length === 0 ? (
                    <div className="text-xs text-slate-600">Sem itens por enquanto.</div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold text-slate-900">Soft</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysisPreview.competenciesSoft.slice(0, 6).map((c) => {
                    const active = confirmedCompetencies.soft.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        disabled={!canWrite}
                        title={`${c.score}/100`}
                        onClick={() => {
                          setConfirmedCompetencies((prev) => {
                            const has = prev.soft.includes(c.name);
                            const next = has ? prev.soft.filter((x) => x !== c.name) : [...prev.soft, c.name];
                            return { ...prev, soft: next.slice(0, 30) };
                          });
                        }}
                        className={
                          active
                            ? "rounded-full bg-brand-blue px-3 py-1 text-xs font-semibold text-white"
                            : "rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700"
                        }
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {analysisPreview.competenciesSoft.length === 0 ? (
                    <div className="text-xs text-slate-600">Sem itens por enquanto.</div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
                <div className="text-xs font-semibold text-slate-900">Áreas</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysisPreview.areas.slice(0, 6).map((c) => {
                    const active = confirmedCompetencies.areas.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        disabled={!canWrite}
                        title={`${c.score}/100`}
                        onClick={() => {
                          setConfirmedCompetencies((prev) => {
                            const has = prev.areas.includes(c.name);
                            const next = has ? prev.areas.filter((x) => x !== c.name) : [...prev.areas, c.name];
                            return { ...prev, areas: next.slice(0, 30) };
                          });
                        }}
                        className={
                          active
                            ? "rounded-full bg-brand-blue px-3 py-1 text-xs font-semibold text-white"
                            : "rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700"
                        }
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {analysisPreview.areas.length === 0 ? (
                    <div className="text-xs text-slate-600">Sem itens por enquanto.</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-900">Selecionadas</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...confirmedCompetencies.hard, ...confirmedCompetencies.soft, ...confirmedCompetencies.areas].map((k) => (
                  <div key={k} className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-blue">
                    {k}
                  </div>
                ))}
                {[
                  ...confirmedCompetencies.hard,
                  ...confirmedCompetencies.soft,
                  ...confirmedCompetencies.areas,
                ].length === 0 ? (
                  <div className="text-xs text-slate-600">Nenhuma selecionada.</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-600">Ainda não extraído.</div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Convidar avaliadores</div>
            <div className="mt-1 text-sm text-slate-600">Convide mentores, pares ou gestores por e-mail.</div>
          </div>
          {inviteLink ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand-blue hover:underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink ?? "");
                } catch {
                  return;
                }
              }}
            >
              Copiar link do último convite
            </button>
          ) : null}
        </div>

        {canWrite ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
              placeholder="email@exemplo.com"
              type="email"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "PEER" | "MENTOR" | "MANAGER")}
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
            >
              {(["PEER", "MENTOR", "MANAGER"] as const).map((r) => (
                <option key={r} value={r}>
                  {r === "PEER" ? "Par" : r === "MENTOR" ? "Mentor" : "Gestor"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                startTransition(async () => {
                  const res = await fetch(`/api/projects/${projectId}/participants`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
                  }).catch(() => null);
                  if (!res || !res.ok) return;
                  const listRes = await fetch(`/api/projects/${projectId}/participants`, { method: "GET" }).catch(() => null);
                  if (!listRes || !listRes.ok) return;
                  const data = (await listRes.json().catch(() => null)) as
                    | { participants?: ParticipantDTO[]; invites?: InviteDTO[]; inviteLink?: string }
                    | null;
                  setParticipants(Array.isArray(data?.participants) ? data!.participants! : []);
                  setInvites(Array.isArray(data?.invites) ? data!.invites! : []);
                  setInviteLink(typeof data?.inviteLink === "string" ? data!.inviteLink! : null);
                  setInviteEmail("");
                });
              }}
            >
              Convidar
            </button>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{p.user.name}</div>
                <div className="truncate text-xs text-slate-600">{p.user.email}</div>
              </div>
              <div className="text-xs font-semibold text-slate-700">
                {p.role === "PEER" ? "Par" : p.role === "MENTOR" ? "Mentor" : "Gestor"}
              </div>
            </div>
          ))}
          {participants.length === 0 && invites.length === 0 ? (
            <div className="text-sm text-slate-600">Nenhum participante ainda.</div>
          ) : null}
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{i.email}</div>
                <div className="truncate text-xs text-slate-600">
                  Convite • {i.role === "PEER" ? "Par" : i.role === "MENTOR" ? "Mentor" : "Gestor"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Autoavaliação</div>
            <div className="mt-1 text-sm text-slate-600">Avalie rapidamente esta experiência (1 a 5).</div>
          </div>
          {feedbackSaveState.status === "saving" ? (
            <div className="text-xs font-semibold text-slate-600">Salvando…</div>
          ) : feedbackSaveState.status === "saved" ? (
            <div className="text-xs text-slate-500">Salvo</div>
          ) : feedbackSaveState.status === "error" ? (
            <div className="text-xs font-semibold text-rose-700">{feedbackSaveState.message}</div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["execution", "Execução"],
              ["collaboration", "Colaboração"],
              ["communication", "Comunicação"],
              ["leadership", "Liderança"],
              ["ownership", "Protagonismo"],
            ] as Array<[RatingKey, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2">
              <span className="text-sm font-semibold text-slate-900">{label}</span>
              <select
                className="h-9 rounded-lg border border-slate-300/70 bg-white px-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
                value={ratings[key]}
                disabled={!canWrite}
                onChange={(e) =>
                  setRatings((prev) => ({ ...prev, [key]: Math.max(1, Math.min(5, Number(e.target.value) || 3)) }))
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-900">Comentário (opcional)</span>
          <textarea
            className="min-h-[90px] w-full resize-y rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder="Evidências de impacto, pontos fortes, pontos a melhorar…"
            disabled={!canWrite}
          />
        </label>

        <div className="mt-3">
          <button
            type="button"
            disabled={!canWrite || isPending}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              startTransition(async () => {
                setFeedbackSaveState({ status: "saving" });
                const res = await fetch(`/api/projects/${projectId}/feedback`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ ratings, comment: feedbackComment }),
                }).catch(() => null);
                if (!res || !res.ok) {
                  setFeedbackSaveState({ status: "error", message: "Não foi possível salvar sua avaliação" });
                  return;
                }
                setFeedbackSaveState({ status: "saved", at: new Date() });
              });
            }}
          >
            Salvar avaliação
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          {status === "SUBMITTED" ? "Esta experiência já foi enviada." : "Finalize STAR + D quando estiver no desktop."}
        </div>
        <Link
          href={`/student/projects/${projectId}`}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Continuar no modo completo
        </Link>
      </div>
    </div>
  );
}
