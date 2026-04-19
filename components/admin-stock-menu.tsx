"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type MenuItem = {
  label: string;
  href: string;
  requiresMultiLocation?: boolean;
};

type MenuSection = {
  key: string;
  items: readonly MenuItem[];
};

const sections: readonly MenuSection[] = [
  {
    key: "master",
    items: [
      { label: "Product List", href: "/admin/products" },
      { label: "Product Group", href: "/admin/product-groups" },
      { label: "Product Sub-Group", href: "/admin/product-sub-groups" },
      { label: "Product Brand", href: "/admin/brands" },
      { label: "Stock Location", href: "/admin/stock/locations" },
    ],
  },
  {
    key: "transactions",
    items: [
      { label: "Opening Stock", href: "/admin/stock/opening-stock" },
      { label: "Stock Receive", href: "/admin/stock/stock-receive" },
      { label: "Stock Issue", href: "/admin/stock/stock-issue" },
      { label: "Stock Adjustment", href: "/admin/stock/stock-adjustment" },
      { label: "Stock Assembly", href: "/admin/stock/stock-assembly" },
      { label: "Stock Transfer", href: "/admin/stock/stock-transfer", requiresMultiLocation: true },
    ],
  },
  {
    key: "tracking",
    items: [
      { label: "Batch No", href: "/admin/stock/batch-no" },
      { label: "Serial No", href: "/admin/stock/serial-no" },
    ],
  },
] as const;

const allItems = sections.flatMap((section) => section.items);

export function AdminStockMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [multiLocationEnabled, setMultiLocationEnabled] = useState(true);
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

  useEffect(() => {
    let cancelled = false;

    async function loadStockSettings() {
      try {
        const response = await fetch("/api/admin/settings/stock", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok || cancelled) return;
        setMultiLocationEnabled(Boolean(data.config?.multiLocationEnabled));
      } catch {
        if (!cancelled) setMultiLocationEnabled(true);
      }
    }

    void loadStockSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = allItems.some((item) => pathname.startsWith(item.href));

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 text-sm font-medium transition hover:text-white ${isActive ? "text-white" : "text-white/80"}`}
      >
        <span>Stock</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+12px)] z-[70] min-w-[250px] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0c]/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
            Batch B
          </div>

          {sections.map((section, sectionIndex) => (
            <div key={section.key}>
              {sectionIndex > 0 ? <div className="mx-4 border-t border-white/10" /> : null}

              {section.items.map((item) => {
                const active = pathname === item.href;
                const disabled = Boolean(item.requiresMultiLocation) && !multiLocationEnabled;

                if (disabled) {
                  return (
                    <div
                      key={item.href}
                      className="block cursor-not-allowed px-4 py-4 text-sm text-white/35"
                      title="Enable Multi Location in Stock Settings to use Stock Transfer."
                    >
                      {item.label}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-4 py-4 text-sm transition hover:bg-white/10 hover:text-white ${active ? "bg-white/10 text-white" : "text-white/85"}`}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
