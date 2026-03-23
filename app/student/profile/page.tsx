import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthUser, setAuthCookie, signAuthToken } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function normalizeUrl(value: unknown) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v.length) return null;
  const withProtocol = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

function toString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toBool(value: unknown) {
  return value === "on" || value === "true" || value === "1";
}

export default async function StudentProfilePage() {
  const user = await requireAuthUser();

  const [existing, projects] = await Promise.all([
    prisma.userProfile.findFirst({
      where: { userId: user.id },
      select: {
        headline: true,
        phone: true,
        location: true,
        bio: true,
        linkedinUrl: true,
        githubUrl: true,
        websiteUrl: true,
        portfolioSettings: true,
      },
    }),
    prisma.project.findMany({
      where: { userId: user.id, status: "SUBMITTED" },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, title: true, updatedAt: true },
      take: 30,
    }),
  ]);

  const settings = (existing?.portfolioSettings ?? null) as
    | { featuredProjectIds?: unknown; hideStar?: unknown; hideEvidences?: unknown }
    | null;
  const featuredProjectIds = Array.isArray(settings?.featuredProjectIds)
    ? settings!.featuredProjectIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
    : [];
  const hideStar = Boolean(settings?.hideStar);
  const hideEvidences = Boolean(settings?.hideEvidences);

  async function saveProfile(formData: FormData) {
    "use server";

    const user = await requireAuthUser();

    const schema = z.object({
      name: z.string().trim().min(1).max(80),
      headline: z.string().trim().max(140).optional(),
      phone: z.string().trim().max(40).optional(),
      location: z.string().trim().max(80).optional(),
      bio: z.string().trim().max(1200).optional(),
      featuredProjectIds: z.array(z.string().min(1)).max(3),
      publicShowStar: z.boolean(),
      publicShowEvidences: z.boolean(),
      linkedinUrl: z.string().optional(),
      githubUrl: z.string().optional(),
      websiteUrl: z.string().optional(),
    });

    const parsed = schema.safeParse({
      name: toString(formData.get("name")),
      headline: toString(formData.get("headline")) || undefined,
      phone: toString(formData.get("phone")) || undefined,
      location: toString(formData.get("location")) || undefined,
      bio: toString(formData.get("bio")) || undefined,
      featuredProjectIds: formData.getAll("featuredProjectIds").filter((x): x is string => typeof x === "string").slice(0, 3),
      publicShowStar: toBool(formData.get("publicShowStar")),
      publicShowEvidences: toBool(formData.get("publicShowEvidences")),
      linkedinUrl: toString(formData.get("linkedinUrl")) || undefined,
      githubUrl: toString(formData.get("githubUrl")) || undefined,
      websiteUrl: toString(formData.get("websiteUrl")) || undefined,
    });
    if (!parsed.success) return;

    const portfolioSettings = {
      featuredProjectIds: parsed.data.featuredProjectIds,
      hideStar: !parsed.data.publicShowStar,
      hideEvidences: !parsed.data.publicShowEvidences,
    };

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name },
      select: { id: true, email: true, name: true, role: true },
    });

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        headline: parsed.data.headline || null,
        phone: parsed.data.phone || null,
        location: parsed.data.location || null,
        bio: parsed.data.bio || null,
        linkedinUrl: normalizeUrl(parsed.data.linkedinUrl) ?? null,
        githubUrl: normalizeUrl(parsed.data.githubUrl) ?? null,
        websiteUrl: normalizeUrl(parsed.data.websiteUrl) ?? null,
        portfolioSettings,
      },
      update: {
        headline: parsed.data.headline || null,
        phone: parsed.data.phone || null,
        location: parsed.data.location || null,
        bio: parsed.data.bio || null,
        linkedinUrl: normalizeUrl(parsed.data.linkedinUrl) ?? null,
        githubUrl: normalizeUrl(parsed.data.githubUrl) ?? null,
        websiteUrl: normalizeUrl(parsed.data.websiteUrl) ?? null,
        portfolioSettings,
      },
      select: { userId: true },
    });

    const token = await signAuthToken({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    });
    await setAuthCookie(token);

    revalidatePath("/student/profile");
    revalidatePath("/student/cv");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Meu Perfil</h1>
          <p className="mt-1 text-sm text-slate-600">Dados básicos e preferências do portfólio.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/student/cv"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0"
          >
            Ver portfólio
          </Link>
        </div>
      </div>

      <form action={saveProfile} className="flex flex-col gap-4">
        <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Identidade</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">Nome</span>
              <input
                name="name"
                defaultValue={user.name}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">E-mail</span>
              <input
                value={user.email}
                disabled
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-slate-50 px-3 text-sm text-slate-700"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-900">Headline (opcional)</span>
              <input
                name="headline"
                defaultValue={existing?.headline ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="Ex: Estudante de Dados • Projetos em BI e Analytics"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">Local (opcional)</span>
              <input
                name="location"
                defaultValue={existing?.location ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="Ex: São Paulo, SP"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">Telefone (opcional)</span>
              <input
                name="phone"
                defaultValue={existing?.phone ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="Ex: +55 11 99999-9999"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-900">Bio (opcional)</span>
              <textarea
                name="bio"
                defaultValue={existing?.bio ?? ""}
                className="min-h-[110px] w-full resize-y rounded-xl border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="2–4 linhas: o que você gosta de fazer, áreas, ferramentas, objetivos."
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Links (opcional)</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">LinkedIn</span>
              <input
                name="linkedinUrl"
                defaultValue={existing?.linkedinUrl ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="linkedin.com/in/..."
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">GitHub</span>
              <input
                name="githubUrl"
                defaultValue={existing?.githubUrl ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="github.com/..."
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-900">Site</span>
              <input
                name="websiteUrl"
                defaultValue={existing?.websiteUrl ?? ""}
                className="h-11 w-full rounded-xl border border-slate-300/70 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-orange/60 focus:ring-2 focus:ring-brand-orange/25"
                placeholder="seusite.com"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-300/70 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Preferências do portfólio público</div>
              <div className="mt-1 text-sm text-slate-600">Escolha o que mostrar e o que destacar.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2">
              <span className="text-sm font-semibold text-slate-900">Mostrar STAR + D</span>
              <input
                name="publicShowStar"
                type="checkbox"
                defaultChecked={!hideStar}
                className="h-5 w-5 accent-brand-blue"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2">
              <span className="text-sm font-semibold text-slate-900">Mostrar evidências</span>
              <input
                name="publicShowEvidences"
                type="checkbox"
                defaultChecked={!hideEvidences}
                className="h-5 w-5 accent-brand-blue"
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-900">Destaques (até 3)</div>
            <div className="mt-1 text-sm text-slate-600">Os destaques aparecem primeiro no portfólio público.</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {projects.length ? (
                projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{p.title?.trim().length ? p.title : "Sem título"}</div>
                      <div className="truncate text-xs text-slate-600">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(p.updatedAt)}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      name="featuredProjectIds"
                      value={p.id}
                      defaultChecked={featuredProjectIds.includes(p.id)}
                      className="h-5 w-5 accent-brand-blue"
                    />
                  </label>
                ))
              ) : (
                <div className="text-sm text-slate-600">
                  Envie pelo menos 1 experiência para escolher destaques.{" "}
                  <Link href="/student/projects" className="font-semibold text-brand-blue hover:underline">
                    Ir para Experiências
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-6 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

