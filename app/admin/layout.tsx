import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { requireAuthUser } from "@/app/lib/auth";
import LogoutButton from "@/app/student/ui/LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthUser();
  if (user.role !== "SCHOOL") redirect("/student/projects");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-transparent">
      <header className="sticky top-0 z-40 border-b-4 border-brand-orange/90 bg-brand-blue/85 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-brand-blue/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/people-analytics" className="flex items-center gap-3 text-sm font-semibold text-white">
              <Image src="/xma-career-logo.svg" alt="XMA Career" width={48} height={48} priority />
              <span>XMA Career • Gestão</span>
            </Link>
            <nav className="hidden items-center gap-3 text-sm sm:flex">
              <Link href="/admin/people-analytics" className="text-white/85 hover:text-white">
                People Analytics
              </Link>
              <Link href="/admin/taxonomy" className="text-white/85 hover:text-white">
                Taxonomia
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-sm text-white/85 sm:block">{user.name}</div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
