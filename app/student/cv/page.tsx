import Link from "next/link";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { ensureUserCompetencyProfile } from "@/app/lib/profile";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

function toEvidenceArray(value: unknown): Array<{ label: string; url: string }> {
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

function toArray(value: unknown): Array<{ name: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const name = (x as { name?: unknown }).name;
      const score = (x as { score?: unknown }).score;
      return { name: typeof name === "string" ? name : "N/A", score: typeof score === "number" ? score : 0 };
    })
    .filter((x) => x.name !== "N/A");
}

function normalizeConfirmedCompetencies(value: unknown) {
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function experienceLabel(value: string | null | undefined) {
  if (value === "ACADEMIC") return "Acadêmico";
  if (value === "INTERNSHIP") return "Estágio";
  if (value === "WORK") return "Trabalho";
  if (value === "VOLUNTEER") return "Voluntariado";
  if (value === "PERSONAL") return "Pessoal";
  if (value === "EVENT") return "Evento";
  if (value === "OTHER") return "Outro";
  return null;
}

function formatMonthYear(value: Date | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}

async function ensurePortfolioShare(userId: string) {
  const existing = await prisma.portfolioShare.findFirst({
    where: { userId },
    select: { id: true, token: true, enabled: true },
  });
  if (existing) return existing;

  for (let i = 0; i < 3; i += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    try {
      return await prisma.portfolioShare.create({
        data: { userId, token, enabled: false },
        select: { id: true, token: true, enabled: true },
      });
    } catch {
      continue;
    }
  }

  return await prisma.portfolioShare.create({
    data: { userId, token: crypto.randomBytes(32).toString("base64url"), enabled: false },
    select: { id: true, token: true, enabled: true },
  });
}

export default async function StudentCvPage() {
  const user = await requireAuthUser();
  const share = await ensurePortfolioShare(user.id);
  const sharePath = `/p/${share.token}`;
  const taxonomy = await getTaxonomyBundle(prisma);
  const profile = await ensureUserCompetencyProfile(prisma, user.id);

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      headline: true,
      experienceDescription: true,
      experienceType: true,
      organization: true,
      roleTitle: true,
      location: true,
      startDate: true,
      endDate: true,
      projectUrl: true,
      repoUrl: true,
      tags: true,
      confirmedCompetencies: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      evidences: true,
      evidenceFiles: { select: { id: true, name: true, size: true } },
      analysis: {
        select: {
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
          updatedAt: true,
        },
      },
    },
  });

  const hydrated = await Promise.all(
    projects.map(async (p) => {
      if (p.analysis) return p;
      const analysis = analyzeProjectText(p, taxonomy);
      const saved = await prisma.projectAnalysis.upsert({
        where: { projectId: p.id },
        create: {
          projectId: p.id,
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        update: {
          competenciesHard: analysis.competenciesHard,
          competenciesSoft: analysis.competenciesSoft,
          areas: analysis.areas,
          leadershipProfile: analysis.leadershipProfile,
          leadershipScore: analysis.leadershipScore,
        },
        select: {
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
          updatedAt: true,
        },
      });
      return { ...p, analysis: saved };
    }),
  );

  const topHard = toArray(profile.competenciesHard).slice(0, 8);
  const topSoft = toArray(profile.competenciesSoft).slice(0, 8);
  const topAreas = toArray(profile.areas).slice(0, 8);
  const leadershipAvg = profile.leadershipScore;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Portfólio e Diagnóstico</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gerado a partir das suas experiências enviadas em STAR + D.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/api/student/cv/json"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-orange bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Baixar para integração
          </a>
          <a
            href="/api/student/cv/csv"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-orange bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Baixar para planilha
          </a>
        </div>
      </div>

      {hydrated.length === 0 ? (
        <div className="rounded-3xl border border-slate-300/70 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Envie pelo menos 1 experiência para gerar seu portfólio e diagnóstico.{" "}
          <Link href="/student/projects" className="font-semibold text-brand-blue hover:underline">
            Ir para Experiências
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="text-sm font-semibold text-slate-900">{user.name}</div>
            <div className="mt-1 text-sm text-slate-600">{user.email}</div>

            <div className="mt-5 rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Link público</div>
              <div className="mt-2 flex flex-col gap-2">
                <a
                  href={sharePath}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-semibold text-brand-blue hover:underline"
                  title={sharePath}
                >
                  {sharePath}
                </a>
                <div className="text-xs text-slate-600">
                  Status:{" "}
                  <span className="font-semibold text-slate-800">{share.enabled ? "Ativo" : "Desativado"}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {share.enabled ? (
                    <form action={disablePortfolioShare}>
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
                      >
                        Desativar
                      </button>
                    </form>
                  ) : (
                    <form action={enablePortfolioShare}>
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0"
                      >
                        Ativar
                      </button>
                    </form>
                  )}
                  <form action={rotatePortfolioShare}>
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-orange bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
                    >
                      Regenerar link
                    </button>
                  </form>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Destaques
              </div>
              <div className="mt-2 grid gap-2">
                <Metric label="Experiências enviadas" value={`${hydrated.length}`} />
                <Metric label="Liderança (média)" value={`${leadershipAvg}/100`} />
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Áreas predominantes
              </div>
              <TagList items={topAreas} />
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Competências hard
              </div>
              <TagList items={topHard} />
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Competências soft
              </div>
              <TagList items={topSoft} />
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-2">
            {hydrated.map((p) => {
              const title = p.title?.trim().length ? p.title : "Experiência sem título";
              const evidences = toEvidenceArray(p.evidences);
              const files = Array.isArray(p.evidenceFiles) ? p.evidenceFiles : [];
              const confirmed = normalizeConfirmedCompetencies(p.confirmedCompetencies);
              const confirmedChips =
                confirmed && (confirmed.hard.length || confirmed.soft.length || confirmed.areas.length)
                  ? [...confirmed.areas.slice(0, 4), ...confirmed.soft.slice(0, 4), ...confirmed.hard.slice(0, 4)]
                  : null;
              const metaParts = [
                experienceLabel(p.experienceType),
                p.organization?.trim().length ? p.organization.trim() : null,
                p.roleTitle?.trim().length ? p.roleTitle.trim() : null,
                (() => {
                  const start = formatMonthYear(p.startDate);
                  const end = formatMonthYear(p.endDate);
                  if (start && end) return `${start} – ${end}`;
                  if (start) return `${start} – atual`;
                  if (end) return end;
                  return null;
                })(),
                p.location?.trim().length ? p.location.trim() : null,
              ].filter((x): x is string => typeof x === "string" && x.length > 0);
              const headline = p.headline?.trim().length ? p.headline.trim() : null;
              const experienceDescription = p.experienceDescription?.trim().length ? p.experienceDescription.trim() : null;
              return (
                <div key={p.id} className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="text-base font-semibold text-slate-950">{title}</div>
                      {headline ? <div className="text-sm text-slate-700">{headline}</div> : null}
                      {experienceDescription ? <div className="text-sm text-slate-700">{experienceDescription}</div> : null}
                      {metaParts.length ? <div className="text-xs text-slate-600">{metaParts.join(" • ")}</div> : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.analysis?.leadershipProfile} • {p.analysis?.leadershipScore}/100
                    </div>
                  </div>
                  {p.projectUrl?.trim().length || p.repoUrl?.trim().length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.projectUrl?.trim().length ? (
                        <a
                          href={p.projectUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                        >
                          Link da experiência
                        </a>
                      ) : null}
                      {p.repoUrl?.trim().length ? (
                        <a
                          href={p.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                        >
                          Repositório
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {Array.isArray(p.tags) && p.tags.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.tags
                        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                        .slice(0, 10)
                        .map((t) => (
                          <div
                            key={t}
                            className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
                          >
                            {t}
                          </div>
                        ))}
                    </div>
                  ) : null}
                  {confirmedChips ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {confirmedChips.map((t) => (
                        <div
                          key={t}
                          className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-slate-800"
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {evidences.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {evidences.slice(0, 6).map((e) => (
                        <a
                          key={`${e.label}-${e.url}`}
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-brand-blue hover:underline"
                          title={e.url}
                        >
                          {e.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {files.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {files.slice(0, 6).map((f) => (
                        <a
                          key={f.id}
                          href={`/api/evidence-files/${f.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300/70 bg-white px-3 py-2 text-xs font-semibold text-brand-blue shadow-sm hover:underline"
                          title={f.name}
                        >
                          <span className="min-w-0 truncate">{f.name}</span>
                          <span className="text-slate-600">{formatBytes(f.size)}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Section title="Situação" text={p.situation} />
                    <Section title="Tarefa" text={p.task} />
                    <Section title="Ação" text={p.action} />
                    <Section title="Resultado" text={p.result} />
                  </div>
                  <div className="mt-3">
                    <Section title="Desenvolvimento" text={p.development} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

async function enablePortfolioShare() {
  "use server";
  const user = await requireAuthUser();
  await prisma.portfolioShare.updateMany({ where: { userId: user.id }, data: { enabled: true } });
  revalidatePath("/student/cv");
}

async function disablePortfolioShare() {
  "use server";
  const user = await requireAuthUser();
  await prisma.portfolioShare.updateMany({ where: { userId: user.id }, data: { enabled: false } });
  revalidatePath("/student/cv");
}

async function rotatePortfolioShare() {
  "use server";
  const user = await requireAuthUser();
  for (let i = 0; i < 3; i += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    try {
      await prisma.portfolioShare.updateMany({ where: { userId: user.id }, data: { token, enabled: true } });
      revalidatePath("/student/cv");
      return;
    } catch {
      continue;
    }
  }
  await prisma.portfolioShare.updateMany({
    where: { userId: user.id },
    data: { token: crypto.randomBytes(32).toString("base64url"), enabled: true },
  });
  revalidatePath("/student/cv");
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-300/70 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function TagList({ items }: { items: Array<{ name: string; score: number }> }) {
  if (items.length === 0) return <div className="mt-2 text-sm text-slate-600">—</div>;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((i) => (
        <div
          key={i.name}
          className="rounded-full border border-slate-300/70 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
          title={`${i.score}`}
        >
          {i.name}
        </div>
      ))}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  const value = text?.trim().length ? text.trim() : "—";
  return (
    <div className="rounded-2xl border border-slate-300/70 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-800 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
