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
  const dashboardHref = user?.role === "ADMIN" ? "/admin" : "/dashboard";

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

                <details className="group relative">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-white/85 transition hover:bg-white/10 hover:text-white">
                    <span>Dashboard</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 transition group-open:rotate-180"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </summary>

                  <div className="absolute right-0 top-[calc(100%+10px)] z-[70] min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c]/95 shadow-2xl backdrop-blur-xl">
                    <Link
                      href={dashboardHref}
                      className="block border-b border-white/10 px-4 py-3 text-white/80 transition hover:bg-white/5 hover:text-white"
                    >
                      My Dashboard
                    </Link>
                    <Link
                      href="/change-password"
                      className="block px-4 py-3 text-white/80 transition hover:bg-white/5 hover:text-white"
                    >
                      Change Password
                    </Link>
                  </div>
                </details>

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
