import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

const nav = [
  ["Services", "/services"],
  ["Shop", "/shop"],
  ["Custom Tuning", "/custom-tuning"],
  ["Pricing", "/pricing"],
  ["FAQ", "/faq"],
  ["Contact", "/contact"],
] as const;

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur">
      <div className="container-rk flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold tracking-[0.25em]">
          RK MOTORSPORTS
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="text-sm text-white/70 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} className="text-white/70 hover:text-white">
                {user.role === "ADMIN" ? "Admin" : "Dashboard"}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="rounded-xl border border-white/15 px-3 py-2 text-white/80 hover:bg-white/10">Logout</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-white/70 hover:text-white">Login</Link>
              <Link href="/register" className="rounded-xl bg-white px-3 py-2 font-medium text-black">Register</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
