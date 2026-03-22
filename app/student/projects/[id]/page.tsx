import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import ProjectEditor from "./ui/ProjectEditor";

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

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthUser();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id },
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
      status: true,
      updatedAt: true,
      userId: true,
    },
  });

  if (project && project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE projectId = ${id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) redirect("/student/projects");
  }

  if (!project) redirect("/student/projects");
  const evidences = toEvidenceArray(project.evidences);
  const canEdit = project.userId === user.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-slate-600">
            <Link href="/student/projects" className="hover:underline">
              Experiências
            </Link>{" "}
            /{" "}
            <span className="text-slate-900">
              {project.title?.trim().length ? project.title : "Experiência sem título"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">STAR + D</h1>
        </div>
        <div
          className={
            project.status === "SUBMITTED"
              ? "rounded-full bg-brand-blue/15 px-3 py-1 text-xs font-semibold text-brand-blue"
              : "rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-semibold text-brand-orange"
          }
        >
          {project.status === "SUBMITTED" ? "Enviado" : "Rascunho"}
        </div>
      </div>

      <ProjectEditor
        projectId={project.id}
        canEdit={canEdit}
        initialProject={{
          title: project.title,
          headline: project.headline,
          experienceDescription: project.experienceDescription,
          experienceType: project.experienceType,
          organization: project.organization,
          roleTitle: project.roleTitle,
          location: project.location,
          startDate: project.startDate?.toISOString() ?? null,
          endDate: project.endDate?.toISOString() ?? null,
          projectUrl: project.projectUrl,
          repoUrl: project.repoUrl,
          tags: project.tags,
          confirmedCompetencies: project.confirmedCompetencies,
          situation: project.situation,
          task: project.task,
          action: project.action,
          result: project.result,
          development: project.development,
          evidences,
          status: project.status,
          updatedAt: project.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
