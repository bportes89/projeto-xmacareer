import PDFDocument from "pdfkit";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { analyzeProjectText } from "@/app/lib/projectAnalysis";
import { ensureUserCompetencyProfile } from "@/app/lib/profile";
import { getTaxonomyBundle } from "@/app/lib/taxonomy";

export const runtime = "nodejs";

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

function normalizePortfolioSettings(value: unknown) {
  if (!value || typeof value !== "object") return { featuredProjectIds: [] as string[], hideStar: false, hideEvidences: false };
  const v = value as { featuredProjectIds?: unknown; hideStar?: unknown; hideEvidences?: unknown };
  const featuredProjectIds = Array.isArray(v.featuredProjectIds)
    ? v.featuredProjectIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
    : [];
  return {
    featuredProjectIds,
    hideStar: Boolean(v.hideStar),
    hideEvidences: Boolean(v.hideEvidences),
  };
}

function wrapText(doc: PDFKit.PDFDocument, text: string, maxWidth: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean.length) return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line.length ? `${line} ${w}` : w;
    if (doc.widthOfString(candidate) <= maxWidth) {
      line = candidate;
    } else {
      if (line.length) lines.push(line);
      line = w;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

async function renderPdf(payload: {
  user: { name: string; email: string };
  profile: { headline?: string | null; location?: string | null; bio?: string | null };
  settings: { hideStar: boolean; hideEvidences: boolean; featuredProjectIds: string[] };
  competencyProfile: { competenciesHard: unknown; competenciesSoft: unknown; areas: unknown; leadershipProfile: string; leadershipScore: number };
  projects: Array<{
    id: string;
    title: string;
    headline: string | null;
    experienceDescription: string | null;
    confirmedCompetencies: unknown;
    situation: string;
    task: string;
    action: string;
    result: string;
    development: string;
    evidences: unknown;
    analysis: { leadershipProfile: string; leadershipScore: number; competenciesHard: unknown; competenciesSoft: unknown; areas: unknown } | null;
  }>;
}) {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Portfólio", Author: payload.user.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const sectionGap = 14;

  const h1 = (t: string) => {
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(t, { width: pageWidth });
    doc.moveDown(0.3);
  };
  const h2 = (t: string) => {
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(t, { width: pageWidth });
    doc.moveDown(0.2);
  };
  const p = (t: string) => {
    doc.font("Helvetica").fontSize(10).fillColor("#334155").text(t, { width: pageWidth, lineGap: 2 });
  };
  const small = (t: string) => {
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(t, { width: pageWidth, lineGap: 1.5 });
  };

  h1(payload.user.name);
  small(payload.user.email);
  if (payload.profile.headline?.trim().length) {
    doc.moveDown(0.3);
    p(payload.profile.headline.trim());
  }
  if (payload.profile.location?.trim().length) {
    small(payload.profile.location.trim());
  }
  if (payload.profile.bio?.trim().length) {
    doc.moveDown(0.5);
    p(payload.profile.bio.trim());
  }

  doc.moveDown(0.8);
  h2("Diagnóstico (resumo)");
  small(`Liderança: ${payload.competencyProfile.leadershipProfile} • ${payload.competencyProfile.leadershipScore}/100`);
  doc.moveDown(0.2);
  const toArray = (value: unknown) => {
    if (!Array.isArray(value)) return [] as Array<{ name: string; score: number }>;
    return value
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const name = (x as { name?: unknown }).name;
        const score = (x as { score?: unknown }).score;
        return { name: typeof name === "string" ? name : "", score: typeof score === "number" ? score : 0 };
      })
      .filter((x) => x.name.trim().length > 0)
      .slice(0, 10);
  };
  const topHard = toArray(payload.competencyProfile.competenciesHard).map((x) => x.name).slice(0, 8);
  const topSoft = toArray(payload.competencyProfile.competenciesSoft).map((x) => x.name).slice(0, 8);
  const topAreas = toArray(payload.competencyProfile.areas).map((x) => x.name).slice(0, 8);
  if (topAreas.length) small(`Áreas: ${topAreas.join(", ")}`);
  if (topSoft.length) small(`Soft: ${topSoft.join(", ")}`);
  if (topHard.length) small(`Hard: ${topHard.join(", ")}`);

  doc.moveDown(0.8);
  h2("Experiências");

  for (const proj of payload.projects) {
    const title = proj.title?.trim().length ? proj.title.trim() : "Experiência";
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(title, { width: pageWidth });
    const headline = proj.headline?.trim().length ? proj.headline.trim() : null;
    const desc = proj.experienceDescription?.trim().length ? proj.experienceDescription.trim() : null;
    if (headline) p(headline);
    if (desc) p(desc);

    const confirmed = normalizeConfirmedCompetencies(proj.confirmedCompetencies);
    const chips =
      confirmed && (confirmed.areas.length || confirmed.soft.length || confirmed.hard.length)
        ? [...confirmed.areas.slice(0, 4), ...confirmed.soft.slice(0, 4), ...confirmed.hard.slice(0, 4)]
        : [];
    if (chips.length) small(`Competências: ${chips.join(" • ")}`);

    const analysis = proj.analysis;
    if (analysis) small(`Liderança: ${analysis.leadershipProfile} • ${analysis.leadershipScore}/100`);

    if (!payload.settings.hideEvidences) {
      const evidences = toEvidenceArray(proj.evidences);
      if (evidences.length) small(`Evidências: ${evidences.slice(0, 4).map((e) => e.label).join(" • ")}`);
    }

    if (!payload.settings.hideStar) {
      const renderBlock = (label: string, text: string) => {
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(label);
        const lines = wrapText(doc, text || "", pageWidth);
        doc.font("Helvetica").fontSize(10).fillColor("#334155").text(lines.join("\n"), { width: pageWidth, lineGap: 2 });
      };
      renderBlock("Situação", proj.situation);
      renderBlock("Tarefa", proj.task);
      renderBlock("Ação", proj.action);
      renderBlock("Resultado", proj.result);
      renderBlock("Desenvolvimento", proj.development);
    }

    doc.moveDown(0.6);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(sectionGap / 12);
  }

  doc.end();
  return done;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });

  const taxonomy = await getTaxonomyBundle(prisma);
  const competencyProfile = await ensureUserCompetencyProfile(prisma, user.id);
  const userProfile = await prisma.userProfile.findFirst({
    where: { userId: user.id },
    select: { headline: true, location: true, bio: true, portfolioSettings: true },
  });
  const settings = normalizePortfolioSettings(userProfile?.portfolioSettings);

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: "SUBMITTED" },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      headline: true,
      experienceDescription: true,
      confirmedCompetencies: true,
      situation: true,
      task: true,
      action: true,
      result: true,
      development: true,
      evidences: true,
      analysis: {
        select: {
          competenciesHard: true,
          competenciesSoft: true,
          areas: true,
          leadershipProfile: true,
          leadershipScore: true,
        },
      },
    },
    take: 30,
  });

  const ordered = (() => {
    if (settings.featuredProjectIds.length === 0) return projects;
    const featured = settings.featuredProjectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((x): x is (typeof projects)[number] => Boolean(x));
    const rest = projects.filter((p) => !settings.featuredProjectIds.includes(p.id));
    return [...featured, ...rest];
  })();

  const hydrated = await Promise.all(
    ordered.map(async (p) => {
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
        },
      });
      return { ...p, analysis: saved };
    }),
  );

  const pdf = await renderPdf({
    user: { name: user.name, email: user.email },
    profile: { headline: userProfile?.headline ?? null, location: userProfile?.location ?? null, bio: userProfile?.bio ?? null },
    settings,
    competencyProfile: {
      competenciesHard: competencyProfile.competenciesHard,
      competenciesSoft: competencyProfile.competenciesSoft,
      areas: competencyProfile.areas,
      leadershipProfile: competencyProfile.leadershipProfile,
      leadershipScore: competencyProfile.leadershipScore,
    },
    projects: hydrated.map((p) => ({
      ...p,
      analysis: p.analysis
        ? {
            competenciesHard: p.analysis.competenciesHard,
            competenciesSoft: p.analysis.competenciesSoft,
            areas: p.analysis.areas,
            leadershipProfile: p.analysis.leadershipProfile,
            leadershipScore: p.analysis.leadershipScore,
          }
        : null,
    })),
  });

  const bytes = new Uint8Array(pdf);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="portfolio.pdf"',
      "cache-control": "no-store",
    },
  });
}
