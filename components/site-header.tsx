import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import Image from "next/image";
import { AdminNotificationBell } from "@/components/admin-notification-bell";

const nav = [
  ["Services", "/#services"],
  ["Find a File", "/shop"],
  ["Custom Tuning", "/custom-tuning"],
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
] as const;

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="absolute left-0 top-0 z-50 w-full bg-transparent">
      <div className="container-rk flex h-20 items-center justify-between">
        <Link href="/" className="shrink-0">
          <Image
            src="/logo.png"
            alt="RK Motorsports"
            width={180}
            height={44}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <div className="flex items-center gap-10">
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

          <div className="hidden h-6 w-px bg-white/10 md:block" />

          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                {user.role === "ADMIN" ? <AdminNotificationBell /> : null}

                <Link
                  href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
                  className="text-white/75 transition hover:text-white"
                >
                  {user.role === "ADMIN" ? "Admin" : "Dashboard"}
                </Link>

                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="rounded-full border border-white/20 px-4 py-2 text-white/85 transition hover:bg-white/10"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-red-600 px-5 py-2 font-medium text-white transition hover:bg-red-500"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}