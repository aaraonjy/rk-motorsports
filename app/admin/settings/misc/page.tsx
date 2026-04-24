import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

const cards = [
  {
    title: "Project Maintenance",
    description: "Manage project master data for stock transaction document grouping.",
    href: "/admin/settings/misc/projects",
  },
  {
    title: "Department Maintenance",
    description: "Manage department master data under each project for stock transaction filtering and reporting.",
    href: "/admin/settings/misc/departments",
  },
  {
    title: "Agent Maintenance",
    description: "Manage sales or service agents for customer profile assignment and future reporting.",
    href: "/admin/settings/misc/agents",
  },
] as const;

export default async function AdminSettingsMiscPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Global Settings</p>
        <h1 className="mt-3 text-4xl font-bold">Misc</h1>
        <p className="mt-4 max-w-3xl text-white/70">Maintain shared master data used by stock documents and future reporting screens.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur-md transition hover:border-red-500/30 hover:bg-black/60 md:p-8">
              <div className="text-xl font-bold text-white">{card.title}</div>
              <p className="mt-3 text-sm leading-6 text-white/65">{card.description}</p>
              <div className="mt-6 inline-flex rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white">Open</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
