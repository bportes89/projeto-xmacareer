"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type ProjectStatus = "DRAFT" | "SUBMITTED";

type Evidence = { label: string; url: string };

type ParticipantRole = "MENTOR" | "PEER" | "MANAGER";

type ExperienceType = "ACADEMIC" | "INTERNSHIP" | "WORK" | "VOLUNTEER" | "PERSONAL" | "EVENT" | "OTHER";

type ConfirmedCompetencies = {
  hard: string[];
  soft: string[];
  areas: string[];
};

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

type RatingKey = "execution" | "collaboration" | "communication" | "leadership" | "ownership";

type Ratings = Record<RatingKey, number>;

type MyFeedbackDTO = {
  id: string;
  role: string;
  roleLabel: string;
  ratings: unknown;
  comment: string;
  updatedAt: string;
} | null;

type FeedbackDTO = {
  id: string;
  role: string;
  roleLabel: string;
  ratings: unknown;
  comment: string;
  updatedAt: string;
  evaluator: { id: string; name: string; email: string };
};

type OwnerDTO = { id: string; name: string; email: string; role: string };

type EvidenceFileDTO = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string };
  downloadUrl: string;
};

type ProjectDTO = {
  title: string;
  headline?: string | null;
  experienceDescription?: string | null;
  experienceType?: ExperienceType | null;
  organization?: string | null;
  roleTitle?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  projectUrl?: string | null;
  repoUrl?: string | null;
  tags?: unknown;
  confirmedCompetencies?: unknown;
  situation: string;
  task: string;
  action: string;
  result: string;
  development: string;
  evidences: Evidence[];
  status: ProjectStatus;
  updatedAt: string;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: Date }
  | { status: "error"; message: string };

function isoToMonth(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 7);
}

function monthToIso(month: string) {
  const clean = month.trim();
  if (!/^\d{4}-\d{2}$/.test(clean)) return null;
  const d = new Date(`${clean}-01T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (typeof x === "string" ? x : "")).map((x) => x.trim()).filter((x) => x.length > 0).slice(0, 20);
}

function normalizeConfirmedCompetencies(value: unknown): ConfirmedCompetencies | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { hard?: unknown; soft?: unknown; areas?: unknown };
  const hard = Array.isArray(v.hard) ? v.hard.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const soft = Array.isArray(v.soft) ? v.soft.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const areas = Array.isArray(v.areas) ? v.areas.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return {
    hard: Array.from(new Set(hard.map((x) => x.trim()))).slice(0, 30),
    soft: Array.from(new Set(soft.map((x) => x.trim()))).slice(0, 30),
    areas: Array.from(new Set(areas.map((x) => x.trim()))).slice(0, 30),
  };
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 20);
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

export default function ProjectEditor({
  projectId,
  initialProject,
  canEdit,
}: {
  projectId: string;
  initialProject: ProjectDTO;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState(initialProject.title ?? "");
  const [headline, setHeadline] = useState(initialProject.headline ?? "");
  const [experienceDescription, setExperienceDescription] = useState(initialProject.experienceDescription ?? "");
  const [experienceType, setExperienceType] = useState<ExperienceType | "">(
    (typeof initialProject.experienceType === "string" ? initialProject.experienceType : "") as ExperienceType | "",
  );
  const [organization, setOrganization] = useState(initialProject.organization ?? "");
  const [roleTitle, setRoleTitle] = useState(initialProject.roleTitle ?? "");
  const [location, setLocation] = useState(initialProject.location ?? "");
  const [startMonth, setStartMonth] = useState(isoToMonth(initialProject.startDate ?? null));
  const [endMonth, setEndMonth] = useState(isoToMonth(initialProject.endDate ?? null));
  const [projectUrl, setProjectUrl] = useState(initialProject.projectUrl ?? "");
  const [repoUrl, setRepoUrl] = useState(initialProject.repoUrl ?? "");
  const [tagsText, setTagsText] = useState(toStringArray(initialProject.tags).join(", "));
  const [confirmedCompetencies, setConfirmedCompetencies] = useState<ConfirmedCompetencies>(
    normalizeConfirmedCompetencies(initialProject.confirmedCompetencies) ?? { hard: [], soft: [], areas: [] },
  );
  const [analysisPreview, setAnalysisPreview] = useState<{
    competenciesHard: Array<{ name: string; score: number }>;
    competenciesSoft: Array<{ name: string; score: number }>;
    areas: Array<{ name: string; score: number }>;
    updatedAt: string;
  } | null>(null);
  const [analysisSaveState, setAnalysisSaveState] = useState<SaveState>({ status: "idle" });
  const [customSkillCategory, setCustomSkillCategory] = useState<keyof ConfirmedCompetencies>("soft");
  const [customSkillName, setCustomSkillName] = useState("");
  const [situation, setSituation] = useState(initialProject.situation ?? "");
  const [task, setTask] = useState(initialProject.task ?? "");
  const [action, setAction] = useState(initialProject.action ?? "");
  const [result, setResult] = useState(initialProject.result ?? "");
  const [development, setDevelopment] = useState(initialProject.development ?? "");
  const [evidences, setEvidences] = useState<Evidence[]>(initialProject.evidences ?? []);
  const [status, setStatus] = useState<ProjectStatus>(initialProject.status);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "saved",
    at: new Date(initialProject.updatedAt),
  });
  const [remoteProject, setRemoteProject] = useState<ProjectDTO | null>(null);
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ParticipantRole>("MENTOR");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerDTO | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFileDTO[]>([]);
  const [evidenceFileToUpload, setEvidenceFileToUpload] = useState<File | null>(null);
  const [evidenceFilesSaveState, setEvidenceFilesSaveState] = useState<SaveState>({ status: "idle" });
  const [myFeedback, setMyFeedback] = useState<MyFeedbackDTO>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackDTO[]>([]);
  const [aggregate, setAggregate] = useState<
    | {
        n: number;
        avg: Record<string, number>;
        overall: number;
      }
    | null
  >(null);
  const [ratings, setRatings] = useState<Ratings>({
    execution: 3,
    collaboration: 3,
    communication: 3,
    leadership: 3,
    ownership: 3,
  });
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaveState, setFeedbackSaveState] = useState<SaveState>({ status: "idle" });

  const [isPending, startTransition] = useTransition();
  const debounceTimer = useRef<number | null>(null);
  const lastSentPayload = useRef<string>("");
  const lastServerUpdatedAt = useRef<number>(new Date(initialProject.updatedAt).getTime());

  const payload = useMemo(() => {
    return {
      title,
      headline: headline.trim().length ? headline.trim() : null,
      experienceDescription: experienceDescription.trim().length ? experienceDescription.trim() : null,
      experienceType: experienceType || null,
      organization: organization.trim().length ? organization.trim() : null,
      roleTitle: roleTitle.trim().length ? roleTitle.trim() : null,
      location: location.trim().length ? location.trim() : null,
      startDate: monthToIso(startMonth),
      endDate: monthToIso(endMonth),
      projectUrl: normalizeUrl(projectUrl),
      repoUrl: normalizeUrl(repoUrl),
      tags: parseTags(tagsText),
      confirmedCompetencies,
      situation,
      task,
      action,
      result,
      development,
      evidences,
    };
  }, [
    action,
    development,
    endMonth,
    evidences,
    experienceDescription,
    experienceType,
    headline,
    location,
    organization,
    projectUrl,
    repoUrl,
    result,
    roleTitle,
    situation,
    startMonth,
    confirmedCompetencies,
    tagsText,
    task,
    title,
  ]);

  const payloadRef = useRef(payload);
  const saveStateRef = useRef(saveState);
  const statusRef = useRef(status);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  useEffect(() => {
    saveStateRef.current = saveState;
    if (saveState.status === "saved") lastServerUpdatedAt.current = saveState.at.getTime();
  }, [saveState]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const canSubmit = useMemo(() => {
    if (!canEdit) return false;
    if (status === "SUBMITTED") return false;
    return (
      title.trim().length >= 3 &&
      situation.trim().length >= 20 &&
      task.trim().length >= 20 &&
      action.trim().length >= 20 &&
      result.trim().length >= 20 &&
      development.trim().length >= 20
    );
  }, [action, canEdit, development, result, situation, status, task, title]);

  useEffect(() => {
    if (!canEdit) return;
    const serialized = JSON.stringify(payload);
    if (serialized === lastSentPayload.current) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(async () => {
      lastSentPayload.current = serialized;
      setSaveState({ status: "saving" });

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: serialized,
      }).catch(() => null);

      if (!res || !res.ok) {
        setSaveState({ status: "error", message: "Falha ao salvar automaticamente" });
        return;
      }

      const updated = (await res.json().catch(() => null)) as { updatedAt?: string } | null;
      setSaveState({ status: "saved", at: new Date(updated?.updatedAt ?? Date.now()) });
    }, 800);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [canEdit, payload, projectId]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (statusRef.current === "SUBMITTED") return;

      const serialized = JSON.stringify(payloadRef.current);
      const isDirty = serialized !== lastSentPayload.current;
      if (isDirty) return;
      if (saveStateRef.current.status === "saving") return;

      const res = await fetch(`/api/projects/${projectId}`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;

      const serverRaw = (await res.json().catch(() => null)) as
        | (Omit<ProjectDTO, "evidences"> & { evidences?: unknown; tags?: unknown })
        | null;
      const server = serverRaw
        ? { ...serverRaw, evidences: toEvidenceArray(serverRaw.evidences), tags: toStringArray(serverRaw.tags) }
        : null;
      if (!server?.updatedAt) return;
      const serverTs = new Date(server.updatedAt).getTime();
      if (serverTs > lastServerUpdatedAt.current) setRemoteProject(server);
    }, 5000);

    return () => window.clearInterval(interval);
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
      const serverRaw = (await res.json().catch(() => null)) as
        | (Omit<ProjectDTO, "evidences"> & { evidences?: unknown; tags?: unknown })
        | null;
      const server = serverRaw
        ? { ...serverRaw, evidences: toEvidenceArray(serverRaw.evidences), tags: toStringArray(serverRaw.tags) }
        : null;
      if (!server?.updatedAt) return;
      const serverTs = new Date(server.updatedAt).getTime();
      if (serverTs > lastServerUpdatedAt.current) setRemoteProject(server);
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

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/participants`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { owner?: OwnerDTO; participants?: ParticipantDTO[]; invites?: InviteDTO[] }
        | null;
      setOwner(data?.owner ?? null);
      setParticipants(Array.isArray(data?.participants) ? data.participants : []);
      setInvites(Array.isArray(data?.invites) ? data.invites : []);
    };
    void load();
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/evidence-files`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as { files?: EvidenceFileDTO[] } | null;
      setEvidenceFiles(Array.isArray(data?.files) ? data.files : []);
    };
    void load();
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/feedback`, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | {
            myFeedback?: MyFeedbackDTO;
            feedbacks?: FeedbackDTO[];
            aggregate?: { n: number; avg: Record<string, number>; overall: number } | null;
          }
        | null;
      setMyFeedback((data?.myFeedback as MyFeedbackDTO) ?? null);
      setFeedbacks(Array.isArray(data?.feedbacks) ? data.feedbacks : []);
      setAggregate(data?.aggregate ?? null);

      const incoming = (data?.myFeedback as { ratings?: unknown; comment?: unknown } | null)?.ratings;
      if (incoming && typeof incoming === "object") {
        const r = incoming as Partial<Record<RatingKey, unknown>>;
        setRatings({
          execution: typeof r.execution === "number" ? r.execution : 3,
          collaboration: typeof r.collaboration === "number" ? r.collaboration : 3,
          communication: typeof r.communication === "number" ? r.communication : 3,
          leadership: typeof r.leadership === "number" ? r.leadership : 3,
          ownership: typeof r.ownership === "number" ? r.ownership : 3,
        });
      }
      const incomingComment = (data?.myFeedback as { comment?: unknown } | null)?.comment;
      setFeedbackComment(typeof incomingComment === "string" ? incomingComment : "");
    };
    void load();
  }, [projectId]);

  function applyRemoteProject(next: ProjectDTO) {
    setTitle(next.title ?? "");
    setHeadline(typeof next.headline === "string" ? next.headline : "");
    setExperienceDescription(typeof next.experienceDescription === "string" ? next.experienceDescription : "");
    setExperienceType((typeof next.experienceType === "string" ? next.experienceType : "") as ExperienceType | "");
    setOrganization(typeof next.organization === "string" ? next.organization : "");
    setRoleTitle(typeof next.roleTitle === "string" ? next.roleTitle : "");
    setLocation(typeof next.location === "string" ? next.location : "");
    setStartMonth(isoToMonth(next.startDate ?? null));
    setEndMonth(isoToMonth(next.endDate ?? null));
    setProjectUrl(typeof next.projectUrl === "string" ? next.projectUrl : "");
    setRepoUrl(typeof next.repoUrl === "string" ? next.repoUrl : "");
    setTagsText(toStringArray(next.tags).join(", "));
    setConfirmedCompetencies(normalizeConfirmedCompetencies(next.confirmedCompetencies) ?? { hard: [], soft: [], areas: [] });
    setSituation(next.situation ?? "");
    setTask(next.task ?? "");
    setAction(next.action ?? "");
    setResult(next.result ?? "");
    setDevelopment(next.development ?? "");
    setEvidences(toEvidenceArray(next.evidences));
    setStatus(next.status);

    const serialized = JSON.stringify({
      title: next.title ?? "",
      headline: typeof next.headline === "string" && next.headline.trim().length ? next.headline.trim() : null,
      experienceDescription:
        typeof next.experienceDescription === "string" && next.experienceDescription.trim().length
          ? next.experienceDescription.trim()
          : null,
      experienceType: typeof next.experienceType === "string" ? next.experienceType : null,
      organization: typeof next.organization === "string" && next.organization.trim().length ? next.organization.trim() : null,
      roleTitle: typeof next.roleTitle === "string" && next.roleTitle.trim().length ? next.roleTitle.trim() : null,
      location: typeof next.location === "string" && next.location.trim().length ? next.location.trim() : null,
      startDate: monthToIso(isoToMonth(next.startDate ?? null)),
      endDate: monthToIso(isoToMonth(next.endDate ?? null)),
      projectUrl: typeof next.projectUrl === "string" && next.projectUrl.trim().length ? normalizeUrl(next.projectUrl) : null,
      repoUrl: typeof next.repoUrl === "string" && next.repoUrl.trim().length ? normalizeUrl(next.repoUrl) : null,
      tags: toStringArray(next.tags),
      confirmedCompetencies: normalizeConfirmedCompetencies(next.confirmedCompetencies) ?? { hard: [], soft: [], areas: [] },
      situation: next.situation ?? "",
      task: next.task ?? "",
      action: next.action ?? "",
      result: next.result ?? "",
      development: next.development ?? "",
      evidences: toEvidenceArray(next.evidences),
    });
    lastSentPayload.current = serialized;
    lastServerUpdatedAt.current = new Date(next.updatedAt).getTime();
    setSaveState({ status: "saved", at: new Date(next.updatedAt) });
    setRemoteProject(null);
  }

  function renderSaveIndicator() {
    if (saveState.status === "saving") {
      return <div className="text-xs font-semibold text-slate-600">Salvando…</div>;
    }
    if (saveState.status === "saved") {
      const formatted = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(saveState.at);
      return <div className="text-xs text-slate-500">Salvo em {formatted}</div>;
    }
    if (saveState.status === "error") {
      return <div className="text-xs font-semibold text-rose-700">{saveState.message}</div>;
    }
    return null;
  }

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  function roleLabel(role: ParticipantRole) {
    return role === "MENTOR" ? "Mentor" : role === "PEER" ? "Par" : "Gestor";
  }

  function experienceLabel(value: ExperienceType) {
    if (value === "ACADEMIC") return "Acadêmico";
    if (value === "INTERNSHIP") return "Estágio";
    if (value === "WORK") return "Trabalho";
    if (value === "VOLUNTEER") return "Voluntariado";
    if (value === "PERSONAL") return "Pessoal";
    if (value === "EVENT") return "Evento";
    return "Outro";
  }

  function toScoredArray(value: unknown): Array<{ name: string; score: number }> {
    if (!Array.isArray(value)) return [];
    return value
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const name = (x as { name?: unknown }).name;
        const score = (x as { score?: unknown }).score;
        return { name: typeof name === "string" ? name : "", score: typeof score === "number" ? score : 0 };
      })
      .filter((x) => x.name.trim().length > 0)
      .slice(0, 30);
  }

  function toggleConfirmed(category: keyof ConfirmedCompetencies, name: string) {
    const clean = name.trim();
    if (!clean.length) return;
    setConfirmedCompetencies((prev) => {
      const has = prev[category].some((x) => x === clean);
      const nextArr = has ? prev[category].filter((x) => x !== clean) : Array.from(new Set([...prev[category], clean])).slice(0, 30);
      return { ...prev, [category]: nextArr };
    });
  }

  function addCustomSkill() {
    const clean = customSkillName.trim();
    if (!clean.length) return;
    setConfirmedCompetencies((prev) => {
      const nextArr = Array.from(new Set([...prev[customSkillCategory], clean])).slice(0, 30);
      return { ...prev, [customSkillCategory]: nextArr };
    });
    setCustomSkillName("");
  }

  async function analyzeNow() {
    if (!canEdit || status === "SUBMITTED") return;
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
    setAnalysisSaveState({ status: "saved", at: new Date() });
  }

  return (
    <div className="flex flex-col gap-4">
      {remoteProject ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-brand-blue/20 bg-brand-blue/10 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-brand-blue">
            Alterações detectadas em outro dispositivo. Carregue para sincronizar.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-orange px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0"
              onClick={() => applyRemoteProject(remoteProject)}
            >
              Carregar
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-brand-blue/40 bg-white/70 px-3 text-xs font-semibold text-brand-blue shadow-sm backdrop-blur transition hover:-translate-y-px hover:bg-white active:translate-y-0"
              onClick={() => setRemoteProject(null)}
            >
              Ignorar
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Título da experiência</div>
            <div className="mt-1 text-sm text-slate-600">
              Use um título curto e descritivo (ex: “Melhoria do atendimento no estágio”).
            </div>
          </div>
          {renderSaveIndicator()}
        </div>
        <input
          className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Digite o título"
          disabled={!canEdit || status === "SUBMITTED"}
        />
        {!canEdit ? (
          <div className="text-xs font-semibold text-slate-600">Apenas visualização</div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-900">Detalhes do portfólio</div>
          <div className="mt-1 text-sm text-slate-600">
            Informações que ajudam a personalizar seu portfólio (opcional).
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-700">Descrição (rápida)</div>
          <textarea
            className="min-h-24 rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            value={experienceDescription}
            onChange={(e) => setExperienceDescription(e.target.value)}
            placeholder="Escreva em 2–4 linhas o que aconteceu, sem se preocupar com competências."
            disabled={!canEdit || status === "SUBMITTED"}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Tipo de experiência</div>
            <select
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              value={experienceType}
              onChange={(e) => setExperienceType(e.target.value as ExperienceType | "")}
              disabled={!canEdit || status === "SUBMITTED"}
            >
              <option value="">Selecione</option>
              {(["ACADEMIC", "INTERNSHIP", "WORK", "VOLUNTEER", "PERSONAL", "EVENT", "OTHER"] as const).map((v) => (
                <option key={v} value={v}>
                  {experienceLabel(v)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Organização (empresa/escola)</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Ex: Empresa X / Universidade Y"
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Seu papel</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="Ex: Estagiário(a), líder do time, dev"
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Local</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: São Paulo/SP (remoto)"
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Início</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Fim</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60"
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Link da experiência</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              placeholder="Ex: https://..."
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-700">Repositório</div>
            <input
              className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Ex: github.com/..."
              disabled={!canEdit || status === "SUBMITTED"}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-700">Headline (1 linha)</div>
          <input
            className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Ex: Automatizei um processo e reduzi tempo em [X%]"
            disabled={!canEdit || status === "SUBMITTED"}
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-700">Tags (separe por vírgula)</div>
          <input
            className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Ex: atendimento, melhoria de processo, liderança"
            disabled={!canEdit || status === "SUBMITTED"}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-900">Evidências</div>
          <div className="mt-1 text-sm text-slate-600">
            Adicione links que comprovem a experiência (ex: certificado, post, repositório, foto).
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
            value={evidenceLabel}
            onChange={(e) => setEvidenceLabel(e.target.value)}
            placeholder="Nome (ex: Certificado)"
            disabled={!canEdit || status === "SUBMITTED"}
          />
          <input
            className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="URL (https://...)"
            disabled={!canEdit || status === "SUBMITTED"}
          />
          <button
            type="button"
            disabled={!canEdit || status === "SUBMITTED"}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              const label = evidenceLabel.trim();
              let url = evidenceUrl.trim();
              if (!label || !url) return;
              if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
              try {
                new URL(url);
              } catch {
                return;
              }
              setEvidences((prev) => [...prev, { label, url }].slice(0, 20));
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
                {status !== "SUBMITTED" ? (
                  <button
                    type="button"
                    disabled={!canEdit}
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

        <div className="pt-2">
          <div className="text-sm font-semibold text-slate-900">Arquivos</div>
          <div className="mt-1 text-sm text-slate-600">
            Envie documentos e imagens como evidência (máx. 10MB por arquivo).
          </div>
        </div>

        {canEdit && status !== "SUBMITTED" ? (
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
                {canEdit && status !== "SUBMITTED" ? (
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

      <div className="grid gap-4 lg:grid-cols-2">
        <StarField
          label="S — Situação"
          hint="Contexto: onde, quando, com quem, qual era o problema/desafio."
          field="situation"
          projectId={projectId}
          disabled={!canEdit || status === "SUBMITTED"}
          value={situation}
          onChange={setSituation}
          min={20}
        />
        <StarField
          label="T — Tarefa"
          hint="Sua responsabilidade: objetivo, meta, restrições, prazo."
          field="task"
          projectId={projectId}
          disabled={!canEdit || status === "SUBMITTED"}
          value={task}
          onChange={setTask}
          min={20}
        />
        <StarField
          label="A — Ação"
          hint="O que você fez: decisões, ferramentas, método, colaboração."
          field="action"
          projectId={projectId}
          disabled={!canEdit || status === "SUBMITTED"}
          value={action}
          onChange={setAction}
          min={20}
        />
        <StarField
          label="R — Resultado"
          hint="Impacto: métricas, melhoria, aprendizado, entrega (se possível quantifique)."
          field="result"
          projectId={projectId}
          disabled={!canEdit || status === "SUBMITTED"}
          value={result}
          onChange={setResult}
          min={20}
        />
      </div>

      <StarField
        label="D — Desenvolvimento"
        hint="O que você desenvolveu: competências, liderança, próximos passos e reflexões."
        field="development"
        projectId={projectId}
        disabled={!canEdit || status === "SUBMITTED"}
        value={development}
        onChange={setDevelopment}
        min={20}
      />

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Competências (IA)</div>
            <div className="mt-1 text-sm text-slate-600">
              Confirme as competências demonstradas nesta experiência (você pode remover ou adicionar).
            </div>
          </div>
          <button
            type="button"
            disabled={!canEdit || status === "SUBMITTED" || analysisSaveState.status === "saving"}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void analyzeNow();
            }}
          >
            {analysisSaveState.status === "saving" ? "Analisando…" : "Analisar"}
          </button>
        </div>

        {analysisSaveState.status === "error" ? (
          <div className="text-xs font-semibold text-rose-700">{analysisSaveState.message}</div>
        ) : null}

        {analysisPreview ? (
          <div className="text-xs text-slate-500">
            Sugestões atualizadas em{" "}
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(analysisPreview.updatedAt))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              { key: "hard", title: "Hard", items: analysisPreview?.competenciesHard ?? [] },
              { key: "soft", title: "Soft", items: analysisPreview?.competenciesSoft ?? [] },
              { key: "areas", title: "Áreas", items: analysisPreview?.areas ?? [] },
            ] as const
          ).map((cat) => {
            const selected = confirmedCompetencies[cat.key];
            const list = cat.items.length ? cat.items : selected.map((name) => ({ name, score: 0 }));
            return (
              <div key={cat.key} className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{cat.title}</div>
                <div className="mt-3 flex flex-col gap-2">
                  {list.length === 0 ? (
                    <div className="text-sm text-slate-600">—</div>
                  ) : (
                    list.slice(0, 12).map((i) => {
                      const isChecked = selected.includes(i.name);
                      return (
                        <label key={i.name} className="flex items-center justify-between gap-3 text-sm text-slate-800">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleConfirmed(cat.key, i.name)}
                              disabled={!canEdit || status === "SUBMITTED"}
                            />
                            <span className="min-w-0 truncate">{i.name}</span>
                          </span>
                          {i.score > 0 ? <span className="text-xs font-semibold text-slate-500">{Math.round(i.score)}</span> : null}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-48"
            value={customSkillCategory}
            onChange={(e) => setCustomSkillCategory(e.target.value as keyof ConfirmedCompetencies)}
            disabled={!canEdit || status === "SUBMITTED"}
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
            <option value="areas">Áreas</option>
          </select>
          <input
            className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            value={customSkillName}
            onChange={(e) => setCustomSkillName(e.target.value)}
            placeholder="Adicionar competência (ex: liderança)"
            disabled={!canEdit || status === "SUBMITTED"}
          />
          <button
            type="button"
            disabled={!canEdit || status === "SUBMITTED"}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={addCustomSkill}
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Participantes</div>
            <div className="mt-1 text-sm text-slate-600">
              {canEdit ? "Convide mentores, pares ou gestores por email." : "Você está como participante (somente leitura)."}
            </div>
          </div>
          {canEdit && inviteLink ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand-blue hover:underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                } catch {
                  return;
                }
              }}
            >
              Copiar link do último convite
            </button>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@exemplo.com"
              disabled={status === "SUBMITTED"}
            />
            <select
              className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as ParticipantRole)}
              disabled={status === "SUBMITTED"}
            >
              <option value="MENTOR">Mentor</option>
              <option value="PEER">Par</option>
              <option value="MANAGER">Gestor</option>
            </select>
            <button
              type="button"
              disabled={status === "SUBMITTED"}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                const email = inviteEmail.trim();
                if (!email) return;
                startTransition(async () => {
                  const res = await fetch(`/api/projects/${projectId}/participants`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email, role: inviteRole }),
                  }).catch(() => null);
                  if (!res || !res.ok) {
                    setSaveState({ status: "error", message: "Não foi possível criar o convite" });
                    return;
                  }
                  const data = (await res.json().catch(() => null)) as { inviteUrl?: string } | null;
                  if (typeof data?.inviteUrl === "string") setInviteLink(data.inviteUrl);
                  const listRes = await fetch(`/api/projects/${projectId}/participants`, { method: "GET" }).catch(
                    () => null,
                  );
                  if (!listRes || !listRes.ok) return;
                  const list = (await listRes.json().catch(() => null)) as
                    | { owner?: OwnerDTO; participants?: ParticipantDTO[]; invites?: InviteDTO[] }
                    | null;
                  setOwner(list?.owner ?? null);
                  setParticipants(Array.isArray(list?.participants) ? list.participants : []);
                  setInvites(Array.isArray(list?.invites) ? list.invites : []);
                  setInviteEmail("");
                });
              }}
            >
              Convidar
            </button>
          </div>
        ) : null}

        <div className={canEdit ? "grid gap-3 sm:grid-cols-2" : ""}>
          <div className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-900">Ativos</div>
            <div className="mt-2 flex flex-col gap-2">
              {participants.length ? (
                participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{p.user.name}</div>
                      <div className="truncate text-xs text-slate-600">{p.user.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-semibold text-slate-700">
                        {roleLabel(p.role)}
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-700 hover:underline"
                          onClick={() => {
                            startTransition(async () => {
                              await fetch(`/api/projects/${projectId}/participants`, {
                                method: "DELETE",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ participantId: p.id }),
                              }).catch(() => null);
                              const listRes = await fetch(`/api/projects/${projectId}/participants`, {
                                method: "GET",
                              }).catch(() => null);
                              if (!listRes || !listRes.ok) return;
                              const list = (await listRes.json().catch(() => null)) as
                                | { owner?: OwnerDTO; participants?: ParticipantDTO[]; invites?: InviteDTO[] }
                                | null;
                              setOwner(list?.owner ?? null);
                              setParticipants(Array.isArray(list?.participants) ? list.participants : []);
                              setInvites(Array.isArray(list?.invites) ? list.invites : []);
                            });
                          }}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-600">Nenhum participante ativo.</div>
              )}
            </div>
          </div>

          {canEdit ? (
            <div className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-900">Convites pendentes</div>
              <div className="mt-2 flex flex-col gap-2">
                {invites.length ? (
                  invites.map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{i.email}</div>
                        <div className="truncate text-xs text-slate-600">
                          Expira em{" "}
                          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(i.expiresAt))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-semibold text-slate-700">
                          {roleLabel(i.role)}
                        </div>
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-700 hover:underline"
                          onClick={() => {
                            startTransition(async () => {
                              await fetch(`/api/projects/${projectId}/participants`, {
                                method: "DELETE",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ inviteId: i.id }),
                              }).catch(() => null);
                              const listRes = await fetch(`/api/projects/${projectId}/participants`, {
                                method: "GET",
                              }).catch(() => null);
                              if (!listRes || !listRes.ok) return;
                              const list = (await listRes.json().catch(() => null)) as
                                | { owner?: OwnerDTO; participants?: ParticipantDTO[]; invites?: InviteDTO[] }
                                | null;
                              setOwner(list?.owner ?? null);
                              setParticipants(Array.isArray(list?.participants) ? list.participants : []);
                              setInvites(Array.isArray(list?.invites) ? list.invites : []);
                            });
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-600">Nenhum convite pendente.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-900">Rede da experiência</div>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{owner?.name ?? "Você"}</span>{" "}
              <span className="text-slate-600">no centro</span> •{" "}
              <span className="font-semibold text-slate-900">{participants.length}</span>{" "}
              <span className="text-slate-600">conexão(ões)</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-slate-800">Mentor</span>
              <span className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-slate-800">Par</span>
              <span className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-slate-800">Gestor</span>
            </div>
          </div>
          <div className="mt-4 w-full overflow-hidden rounded-2xl border border-slate-300/70 bg-slate-50">
            <svg viewBox="0 0 420 220" className="h-[220px] w-full">
              <rect x="0" y="0" width="420" height="220" fill="transparent" />
              {participants.slice(0, 10).map((p, idx, arr) => {
                const cx = 210;
                const cy = 110;
                const r = 78;
                const a = (Math.PI * 2 * idx) / Math.max(arr.length, 1);
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r * 0.72;
                const stroke = p.role === "MENTOR" ? "#F97316" : p.role === "PEER" ? "#0EA5E9" : "#64748B";
                return (
                  <g key={p.id}>
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke={stroke} strokeWidth="2" opacity="0.55" />
                    <circle cx={x} cy={y} r="14" fill={stroke} opacity="0.9" />
                    <text x={x} y={y + 30} textAnchor="middle" fontSize="10" fill="#0f172a">
                      {p.user.name.length > 12 ? `${p.user.name.slice(0, 12)}…` : p.user.name}
                    </text>
                  </g>
                );
              })}
              <circle cx="210" cy="110" r="20" fill="#1e40af" opacity="0.92" />
              <text x="210" y="116" textAnchor="middle" fontSize="11" fill="#ffffff" fontWeight="700">
                Você
              </text>
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Avaliação 360°</div>
            <div className="mt-1 text-sm text-slate-600">
              {canEdit
                ? "Veja o consolidado das avaliações (auto, pares, mentores, gestores)."
                : "Preencha sua avaliação da experiência (sua resposta pode ser atualizada)."}
            </div>
          </div>
          {feedbackSaveState.status === "saving" ? (
            <div className="text-xs font-semibold text-slate-600">Salvando…</div>
          ) : feedbackSaveState.status === "saved" ? (
            <div className="text-xs text-slate-500">Salvo</div>
          ) : feedbackSaveState.status === "error" ? (
            <div className="text-xs font-semibold text-rose-700">{feedbackSaveState.message}</div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-3">
            {aggregate ? (
              <div className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-950">Consolidado</div>
                  <div className="text-xs text-slate-600">
                    {aggregate.n} resposta(s) • Média geral {aggregate.overall.toFixed(1)}/5
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["execution", "Execução"],
                      ["collaboration", "Colaboração"],
                      ["communication", "Comunicação"],
                      ["leadership", "Liderança"],
                      ["ownership", "Protagonismo"],
                    ] as Array<[RatingKey, string]>
                  ).map(([k, label]) => (
                    <div key={k} className="flex items-center justify-between rounded-xl border border-slate-300/70 px-3 py-2">
                      <div className="text-sm font-semibold text-slate-800">{label}</div>
                      <div className="text-sm text-slate-700">{Number(aggregate.avg[k]).toFixed(1)}/5</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">Ainda não há avaliações.</div>
            )}

            {feedbacks.length ? (
              <div className="grid gap-2">
                {feedbacks.map((f) => (
                  <div key={f.id} className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{f.evaluator.name}</div>
                        <div className="truncate text-xs text-slate-600">
                          {f.roleLabel} • {f.evaluator.email}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                          new Date(f.updatedAt),
                        )}
                      </div>
                    </div>
                    {f.comment?.trim().length ? (
                      <div className="mt-3 text-sm text-slate-700">{f.comment}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["execution", "Execução"],
                  ["collaboration", "Colaboração"],
                  ["communication", "Comunicação"],
                  ["leadership", "Liderança"],
                  ["ownership", "Protagonismo"],
                ] as Array<[RatingKey, string]>
              ).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-900">{label}</span>
                  <select
                    className="h-11 rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                    value={ratings[k]}
                    onChange={(e) => setRatings((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
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

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">Comentário (opcional)</span>
              <textarea
                className="min-h-[110px] w-full resize-y rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="Ex: evidências de impacto, pontos fortes, pontos a melhorar…"
              />
            </label>

            <button
              type="button"
              disabled={isPending}
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
                  const refresh = await fetch(`/api/projects/${projectId}/feedback`, { method: "GET" }).catch(() => null);
                  if (!refresh || !refresh.ok) return;
                  const data = (await refresh.json().catch(() => null)) as
                    | {
                        myFeedback?: MyFeedbackDTO;
                      }
                    | null;
                  setMyFeedback((data?.myFeedback as MyFeedbackDTO) ?? null);
                });
              }}
            >
              {myFeedback ? "Atualizar avaliação" : "Enviar avaliação"}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          O envio trava o status como “Enviado”. Você ainda pode criar novas experiências depois.
        </div>
        <button
          type="button"
          disabled={!canSubmit || isPending}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          onClick={() => {
            startTransition(async () => {
              const res = await fetch(`/api/projects/${projectId}/submit`, { method: "POST" });
              if (!res.ok) {
                setSaveState({ status: "error", message: "Não foi possível enviar a experiência" });
                return;
              }
              const payload = (await res.json().catch(() => null)) as
                | { updatedAt?: string; status?: ProjectStatus }
                | null;
              setStatus(payload?.status ?? "SUBMITTED");
              setSaveState({ status: "saved", at: new Date(payload?.updatedAt ?? Date.now()) });
            });
          }}
        >
          Enviar experiência
        </button>
      </div>
    </div>
  );
}

function toEvidenceArray(value: unknown): Evidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const label = (x as { label?: unknown }).label;
      const url = (x as { url?: unknown }).url;
      return { label: typeof label === "string" ? label : "", url: typeof url === "string" ? url : "" };
    })
    .filter((x) => x.label.trim().length > 0 && x.url.trim().length > 0)
    .slice(0, 20);
}

function StarField({
  label,
  hint,
  field,
  projectId,
  disabled,
  value,
  onChange,
  min,
}: {
  label: string;
  hint: string;
  field: "situation" | "task" | "action" | "result" | "development";
  projectId: string;
  disabled: boolean;
  value: string;
  onChange: (v: string) => void;
  min: number;
}) {
  const count = value.trim().length;
  const isShallow = count > 0 && count < min;
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiMissing, setAiMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generate(nonce: number) {
    setError(null);
    setIsLoading(true);
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, field, text: value, nonce }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setIsLoading(false);
      setError("Falha ao gerar sugestão");
      return;
    }

    const payload = (await res.json().catch(() => null)) as
      | { suggestion?: string; score?: number; missing?: string[] }
      | null;
    setSuggestion(payload?.suggestion ?? null);
    setAiScore(typeof payload?.score === "number" ? payload.score : null);
    setAiMissing(Array.isArray(payload?.missing) ? payload.missing : []);
    setIsLoading(false);
  }

  return (
    <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-sm text-slate-600">{hint}</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled || isLoading}
            className="text-xs font-semibold text-brand-blue underline-offset-4 hover:text-brand-blue-hover hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            onClick={async () => {
              await generate(Date.now());
            }}
          >
            {isLoading ? "Gerando…" : "Aprofundar com IA"}
          </button>
          {typeof aiScore === "number" ? (
            <div className="text-xs font-semibold text-slate-700">IA {aiScore}/100</div>
          ) : null}
          <div className={isShallow ? "text-xs font-semibold text-brand-orange" : "text-xs text-slate-500"}>
            {count} caracteres
          </div>
        </div>
      </div>
      <textarea
        className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25 placeholder:text-slate-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escreva aqui…"
        disabled={disabled}
      />
      {isShallow ? (
        <div className="mt-2 rounded-xl border border-brand-orange/30 bg-brand-orange/10 px-3 py-2 text-xs text-brand-orange">
          Resposta curta. Tente incluir evidências e detalhes do que aconteceu.
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
      {suggestion ? (
        <div className="mt-3 rounded-3xl border border-slate-300/70 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold text-slate-900">Sugestão (você decide a versão final)</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled || isLoading}
                className="inline-flex h-8 items-center justify-center rounded-xl border border-brand-orange/60 bg-white px-3 text-xs font-semibold text-brand-orange shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={async () => generate(Date.now())}
              >
                Regenerar
              </button>
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-8 items-center justify-center rounded-xl bg-brand-blue px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  onChange(suggestion);
                  setSuggestion(null);
                }}
              >
                Aplicar
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-xl border border-brand-blue/50 bg-white px-3 text-xs font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
                onClick={() => setSuggestion(null)}
              >
                Fechar
              </button>
            </div>
          </div>
          {aiMissing.length ? (
            <div className="mt-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
              <div className="font-semibold text-slate-900">O que pode faltar</div>
              <div className="mt-1 flex flex-col gap-1">
                {aiMissing.slice(0, 3).map((m) => (
                  <div key={m}>- {m}</div>
                ))}
              </div>
            </div>
          ) : null}
          <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-700">{suggestion}</pre>
        </div>
      ) : null}
    </div>
  );
}
