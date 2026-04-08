import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { AdminNotificationBell } from "@/components/admin-notification-bell";
import { SiteHeaderClient } from "@/components/site-header-client";

const publicNav = [
  ["Services", "/#services"],
  ["Find a File", "/shop"],
  ["Custom Tuning", "/custom-tuning"],
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
] as const;

const adminNav = [
  ["Dashboard", "/admin"],
  ["Customers", "/admin/customers"],
] as const;

export async function SiteHeader() {
  const user = await getSessionUser();
  const nav = user?.role === "ADMIN" ? adminNav : publicNav;

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
                <AdminNotificationBell />
                <SiteHeaderClient user={user} />

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
