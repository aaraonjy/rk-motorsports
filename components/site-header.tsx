import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import Image from "next/image";

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
    <header className="absolute left-0 top-0 z-50 w-full bg-transparent">
      <div className="container-rk flex h-20 items-center justify-between gap-4">
        <Link href="/">
          <Image
            src="/logo.png"
            alt="RK Motorsports"
            width={170}
            height={42}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-white/80 transition hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
                className="text-white/75 transition hover:text-white"
              >
                {user.role === "ADMIN" ? "Admin" : "Dashboard"}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="rounded-full border border-white/20 px-4 py-2 text-white/85 transition hover:bg-white/10">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-white/75 transition hover:text-white">
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-white px-4 py-2 font-medium text-black transition hover:bg-zinc-200"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}