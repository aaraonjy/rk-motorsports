import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <section className="section-pad">
      <div className="container-rk max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-400/80">Sales</p>
        <h1 className="mt-3 text-4xl font-bold">Delivery Order</h1>
        <p className="mt-4 text-white/70">This transaction will be developed in the next sales module phase.</p>
      </div>
    </section>
  );
}
