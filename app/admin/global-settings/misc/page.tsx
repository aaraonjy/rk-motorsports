import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

const MISC_CARDS = [
  {
    title: "Project Maintenance",
    description: "Manage project master data for stock transaction document grouping.",
    href: "/admin/global-settings/misc/projects",
  },
  {
    title: "Department Maintenance",
    description: "Manage department master data under each project for stock transaction filtering and reporting.",
    href: "/admin/global-settings/misc/departments",
  },
  {
    title: "Agent Maintenance",
    description: "Manage sales or service agents for customer profile assignment and future reporting.",
    href: "/admin/global-settings/misc/agents",
  },
  {
    title: "Country Maintenance",
    description: "Manage country codes and descriptions used in customer billing and delivery addresses.",
    href: "/admin/global-settings/misc/country",
  },
  {
    title: "Currency Maintenance",
    description: "Manage currency codes, descriptions, and symbols used in customer profiles and future sales documents.",
    href: "/admin/global-settings/misc/currency",
  },
] as const;

export default async function AdminGlobalSettingsMiscPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-7xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Global Settings</p>
          <h1 className="mt-3 text-4xl font-bold">Misc</h1>
          <p className="mt-4 max-w-3xl text-white/70">
            Maintain shared master data used by stock documents, customer profiles, and future reporting screens.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {MISC_CARDS.map((card) => (
            <div key={card.href} className="rounded-[2rem] border border-white/10 bg-black/45 p-8 backdrop-blur-md">
              <h2 className="text-2xl font-bold text-white">{card.title}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65">{card.description}</p>
              <Link href={card.href} className="mt-6 inline-flex rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400">
                Open
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
