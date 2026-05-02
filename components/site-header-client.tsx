"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type HeaderUser = {
  role: "ADMIN" | "CUSTOMER";
};

type HeaderLink = {
  label: string;
  href: string;
  disabled?: boolean;
  disabledTitle?: string;
};

type HeaderLinkSection = {
  title: string;
  items: HeaderLink[];
};

type DesktopDropdown = {
  label: string;
  sections: HeaderLinkSection[];
};

const guestMobileSections: HeaderLinkSection[] = [
  {
    title: "Menu",
    items: [
      { label: "Services", href: "/#services" },
      { label: "Find a File", href: "/shop" },
      { label: "Custom Tuning", href: "/custom-tuning" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

const salesItems: HeaderLink[] = [
  { label: "Quotation", href: "/admin/sales/quotation" },
  { label: "Sales Order", href: "/admin/sales/sales-order" },
  { label: "Delivery Order", href: "/admin/sales/delivery-order" },
  { label: "Sales Invoice", href: "/admin/sales/sales-invoice" },
  { label: "Cash Sales", href: "/admin/sales/cash-sales" },
  { label: "Debit Note", href: "/admin/sales/debit-note" },
  { label: "Credit Note", href: "/admin/sales/credit-note" },
  { label: "Delivery Return", href: "/admin/sales/delivery-return" },
];

const stockMasterItems: HeaderLink[] = [
  { label: "Product List", href: "/admin/stock/products" },
  { label: "Product Group", href: "/admin/stock/product-groups" },
  { label: "Product Sub-Group", href: "/admin/stock/product-sub-groups" },
  { label: "Product Brand", href: "/admin/stock/brands" },
  { label: "Stock Location", href: "/admin/stock/locations" },
];

const stockTransactionItems: HeaderLink[] = [
  { label: "Opening Stock", href: "/admin/stock/opening-stock" },
  { label: "Stock Receive", href: "/admin/stock/stock-receive" },
  { label: "Stock Issue", href: "/admin/stock/stock-issue" },
  { label: "Stock Adjustment", href: "/admin/stock/stock-adjustment" },
  { label: "Stock Assembly", href: "/admin/stock/stock-assembly" },
  { label: "Stock Transfer", href: "/admin/stock/stock-transfer" },
];

const stockTrackingItems: HeaderLink[] = [
  { label: "Batch No", href: "/admin/stock/batch-no" },
  { label: "Serial No", href: "/admin/stock/serial-no" },
];

const settingsItems: HeaderLink[] = [
  { label: "Account Configuration", href: "/admin/global-settings/account-configuration" },
  { label: "Audit Logs", href: "/admin/global-settings/audit-logs" },
  { label: "Misc", href: "/admin/global-settings/misc" },
  { label: "Stock Settings", href: "/admin/global-settings/stock" },
  { label: "Tax Configuration", href: "/admin/global-settings/tax-configuration" },
];

const adminMobileSections: HeaderLinkSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/admin" },
      { label: "Reports", href: "/admin/reports" },
    ],
  },
  {
    title: "Operations - Sales",
    items: salesItems,
  },
  {
    title: "Operations - Stock",
    items: [...stockTransactionItems, ...stockTrackingItems],
  },
  {
    title: "Master Data",
    items: [{ label: "Customer Profile", href: "/admin/customers" }, ...stockMasterItems],
  },
  {
    title: "Settings",
    items: settingsItems,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  if (href.startsWith("/#")) return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getStockDisabledItems(options: {
  stockModuleEnabled: boolean;
  multiLocationEnabled: boolean;
}) {
  const { stockModuleEnabled, multiLocationEnabled } = options;

  return stockTransactionItems.map((item) => {
    if (!stockModuleEnabled) {
      return {
        ...item,
        disabled: true,
        disabledTitle: "Enable Stock Control in Stock Settings to use this feature.",
      };
    }

    if (item.href === "/admin/stock/stock-transfer" && !multiLocationEnabled) {
      return {
        ...item,
        disabled: true,
        disabledTitle: "Enable Multi Location in Stock Settings to use Stock Transfer.",
      };
    }

    return item;
  });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AdminDesktopDropdown({ menu }: { menu: DesktopDropdown }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = menu.sections.some((section) =>
    section.items.some((item) => isActivePath(pathname, item.href)),
  );

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 text-sm font-medium transition hover:text-white ${
          isActive ? "text-white" : "text-white/80"
        }`}
      >
        <span>{menu.label}</span>
        <ChevronIcon open={isOpen} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+12px)] z-[70] min-w-[290px] max-h-[72vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0c]/95 p-2 shadow-2xl backdrop-blur-xl">
          {menu.sections.map((section, sectionIndex) => (
            <div key={section.title}>
              {sectionIndex > 0 ? <div className="my-2 border-t border-white/10" /> : null}

              <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                {section.title}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  if (item.disabled) {
                    return (
                      <div
                        key={item.href}
                        className="block cursor-not-allowed rounded-xl px-3 py-3 text-sm text-white/35"
                        title={item.disabledTitle}
                      >
                        {item.label}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-xl px-3 py-3 text-sm transition hover:bg-white/10 hover:text-white ${
                        active ? "bg-white/10 text-white" : "text-white/85"
                      }`}
                      onClick={() => setIsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminDesktopNavigation() {
  const pathname = usePathname();
  const [stockModuleEnabled, setStockModuleEnabled] = useState(true);
  const [multiLocationEnabled, setMultiLocationEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStockSettings() {
      try {
        const response = await fetch("/api/admin/global-settings/stock", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data.ok || cancelled) return;

        setStockModuleEnabled(Boolean(data.config?.stockModuleEnabled));
        setMultiLocationEnabled(Boolean(data.config?.multiLocationEnabled));
      } catch {
        if (!cancelled) {
          setStockModuleEnabled(true);
          setMultiLocationEnabled(true);
        }
      }
    }

    void loadStockSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const stockOperationItems = getStockDisabledItems({
    stockModuleEnabled,
    multiLocationEnabled,
  });

  const dropdowns: DesktopDropdown[] = [
    {
      label: "Operations",
      sections: [
        { title: "Sales", items: salesItems },
        { title: "Stock Transactions", items: stockOperationItems },
        { title: "Stock Tracking", items: stockTrackingItems },
      ],
    },
    {
      label: "Master",
      sections: [
        {
          title: "Customers",
          items: [{ label: "Customer Profile", href: "/admin/customers" }],
        },
        { title: "Product & Stock Master", items: stockMasterItems },
      ],
    },
    {
      label: "Settings",
      sections: [{ title: "Global Settings", items: settingsItems }],
    },
  ];

  const reportActive = isActivePath(pathname, "/admin/reports");

  return (
    <>
      <Link
        href="/admin"
        className={`text-sm font-medium transition hover:text-white ${
          pathname === "/admin" ? "text-white" : "text-white/80"
        }`}
      >
        Dashboard
      </Link>

      {dropdowns.map((menu) => (
        <AdminDesktopDropdown key={menu.label} menu={menu} />
      ))}

      <Link
        href="/admin/reports"
        className={`text-sm font-medium transition hover:text-white ${
          reportActive ? "text-white" : "text-white/80"
        }`}
      >
        Reports
      </Link>
    </>
  );
}

export function SiteHeaderClient({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsDashboardOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDashboardOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsDashboardOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-white/85 transition hover:bg-white/10"
      >
        <span>{user.role === "ADMIN" ? "Admin" : "Dashboard"}</span>
        <ChevronIcon open={isDashboardOpen} />
      </button>

      {isDashboardOpen ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[70] w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c]/95 shadow-2xl backdrop-blur-xl">
          <Link
            href="/change-password"
            onClick={() => setIsDashboardOpen(false)}
            className="block px-4 py-4 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            Change Password
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function MobileSiteHeaderMenu({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const sections = user?.role === "ADMIN" ? adminMobileSections : guestMobileSections;

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white/90 backdrop-blur transition hover:bg-white/10"
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm">
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[360px] flex-col border-l border-white/10 bg-[#080808]/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <div>
                <p className="text-sm font-semibold text-white">RK Motorsports</p>
                <p className="mt-1 text-xs text-white/45">
                  {user?.role === "ADMIN" ? "Admin Menu" : "Menu"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.title}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                      {section.title}
                    </p>

                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                      {section.items.map((item) => {
                        const active = isActivePath(pathname, item.href);

                        if (item.disabled) {
                          return (
                            <div
                              key={item.href}
                              className="block cursor-not-allowed border-b border-white/10 px-4 py-3 text-sm text-white/35 last:border-b-0"
                              title={item.disabledTitle}
                            >
                              {item.label}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={`block border-b border-white/10 px-4 py-3 text-sm transition last:border-b-0 hover:bg-white/10 hover:text-white ${
                              active ? "bg-white/10 text-white" : "text-white/75"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 p-5">
              {user ? (
                <div className="space-y-3">
                  <Link
                    href="/change-password"
                    onClick={() => setIsOpen(false)}
                    className="flex w-full items-center justify-center rounded-full border border-white/15 px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
                  >
                    Change Password
                  </Link>

                  <form action="/api/auth/logout" method="post">
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center rounded-full border border-white/15 px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
                    >
                      Logout
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
