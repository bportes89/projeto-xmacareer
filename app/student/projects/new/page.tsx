import { redirect } from "next/navigation";

import { requireAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export default async function NewProjectPage() {
  const user = await requireAuthUser();

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: "",
      situation: "",
      task: "",
      action: "",
      result: "",
      development: "",
      evidences: [],
      status: "DRAFT",
    },
    select: { id: true },
  });

  redirect(`/student/projects/${project.id}`);
}
