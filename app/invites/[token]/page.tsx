import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "crypto";

import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect(`/auth/login`);
  }

  function sha256Hex(value: string) {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  async function accept() {
    "use server";

    const freshUser = await getAuthUser();
    if (!freshUser) redirect("/auth/login");

    const tokenHash = sha256Hex(token.trim());
    const invite = await prisma.projectInvite.findUnique({
      where: { tokenHash },
      select: { id: true, projectId: true, email: true, role: true, expiresAt: true },
    });
    if (!invite) redirect("/student/projects");
    if (invite.expiresAt.getTime() < Date.now()) redirect("/student/projects");
    if (invite.email.toLowerCase() !== freshUser.email.toLowerCase()) redirect("/student/projects");

    const project = await prisma.project.findFirst({
      where: { id: invite.projectId },
      select: { id: true, userId: true },
    });
    if (!project) redirect("/student/projects");
    if (project.userId !== freshUser.id) {
      await prisma.projectParticipant.upsert({
        where: { projectId_userId: { projectId: invite.projectId, userId: freshUser.id } },
        create: {
          projectId: invite.projectId,
          userId: freshUser.id,
          role: invite.role,
          status: "ACTIVE",
        },
        update: { role: invite.role, status: "ACTIVE" },
        select: { id: true },
      });
    }

    await prisma.projectInvite.delete({ where: { id: invite.id } }).catch(() => null);
    redirect(`/student/projects/${invite.projectId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-slate-300/70 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-brand-blue">Convite</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Acessar experiência</h1>
        <p className="mt-2 text-sm text-slate-700">
          Ao aceitar, você entra como participante e poderá visualizar a experiência.
        </p>

        <form action={accept} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-orange-hover active:translate-y-0"
          >
            Aceitar convite
          </button>
          <Link
            href="/student/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-brand-blue/50 bg-white px-5 text-sm font-semibold text-brand-blue shadow-sm transition hover:-translate-y-px hover:bg-slate-50 active:translate-y-0"
          >
            Voltar
          </Link>
        </form>
      </div>
    </div>
  );
}
