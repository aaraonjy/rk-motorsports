import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

const SETTING_CARDS = [
  {
    title: "Audit Logs",
    description: "Review activity history and clean older logs based on the retention policy.",
    href: "/admin/settings/audit-logs",
  },
  {
    title: "Tax Configuration",
    description: "Manage tax module settings, tax mode, and the tax code master list.",
    href: "/admin/settings/tax-configuration",
  },
  {
    title: "Stock Settings",
    description: "Prepare Batch A stock configuration, default location, and future stock module behavior.",
    href: "/admin/settings/stock",
  },
  {
    title: "Product Master",
    description: "Create and manage custom-order products for Stock Item, Service Item, and Non-Stock Item.",
    href: "/admin/products",
  },
] as const;

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Settings Hub</p>
            <h1 className="mt-3 text-4xl font-bold">Admin Settings</h1>
            <p className="mt-4 max-w-3xl text-white/70">
              Central access point for system configuration modules. Batch A adds Product Master and Stock Settings here without changing existing order or reporting logic.
            </p>
          </div>

          <Link href="/admin" className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white transition hover:bg-white/10">
            Back to Admin
          </Link>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {SETTING_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="rounded-[2rem] border border-white/10 bg-black/45 p-6 transition hover:border-red-500/30 hover:bg-black/55 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">Configuration</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{card.title}</h2>
              <p className="mt-4 text-sm leading-6 text-white/65">{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
