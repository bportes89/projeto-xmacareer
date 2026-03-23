import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import CaptureEditor from "./ui/CaptureEditor";

function toEvidenceArray(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const label = (x as { label?: unknown }).label;
      const url = (x as { url?: unknown }).url;
      return {
        label: typeof label === "string" ? label : "",
        url: typeof url === "string" ? url : "",
      };
    })
    .filter((x) => x.label.trim().length > 0 && x.url.trim().length > 0)
    .slice(0, 20);
}

export default async function ProjectCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthUser();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      situation: true,
      confirmedCompetencies: true,
      evidences: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!project) redirect("/student/projects");

  const evidences = toEvidenceArray(project.evidences);
  const canEdit = project.status !== "SUBMITTED";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-slate-600">
            <Link href="/student/projects" className="hover:underline">
              Experiências
            </Link>{" "}
            / <span className="text-slate-900">Captura rápida</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Capture agora</h1>
          <div className="text-sm text-slate-600">
            Registre rápido no celular e finalize no desktop quando quiser.
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <Link
            href={`/student/projects/${project.id}`}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-blue-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Abrir modo completo
          </Link>
          <Link
            href={`/student/cv`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Ver portfólio
          </Link>
        </div>
      </div>

      <CaptureEditor
        projectId={project.id}
        canEdit={canEdit}
        initialProject={{
          title: project.title,
          situation: project.situation,
          confirmedCompetencies: project.confirmedCompetencies,
          evidences,
          status: project.status,
          updatedAt: project.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
