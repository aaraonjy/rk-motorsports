"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type MenuItem = {
  label: string;
  href: string;
};

type MenuSection = {
  key: string;
  items: readonly MenuItem[];
};

const sections: readonly MenuSection[] = [
  {
    key: "main",
    items: [
      { label: "Quotation", href: "/admin/sales/quotation" },
      { label: "Sales Order", href: "/admin/sales/sales-order" },
      { label: "Delivery Order", href: "/admin/sales/delivery-order" },
      { label: "Sales Invoice", href: "/admin/sales/sales-invoice" },
      { label: "Cash Sales", href: "/admin/sales/cash-sales" },
    ],
  },
  {
    key: "adjustments",
    items: [
      { label: "Debit Note", href: "/admin/sales/debit-note" },
      { label: "Credit Note", href: "/admin/sales/credit-note" },
    ],
  },
  {
    key: "returns",
    items: [{ label: "Delivery Return", href: "/admin/sales/delivery-return" }],
  },
] as const;

const allItems = sections.flatMap((section) => section.items);

export function AdminSalesMenu() {
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

  const isActive = allItems.some((item) => pathname.startsWith(item.href));

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 text-sm font-medium transition hover:text-white ${isActive ? "text-white" : "text-white/80"}`}
      >
        <span>Sales</span>
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
          {sections.map((section, sectionIndex) => (
            <div key={section.key}>
              {sectionIndex > 0 ? <div className="mx-4 border-t border-white/10" /> : null}

              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const phaseTwoEnabled =
                  item.href === "/admin/sales/quotation" ||
                  item.href === "/admin/sales/sales-order" ||
                  item.href === "/admin/sales/delivery-order" ||
                  item.href === "/admin/sales/sales-invoice" ||
                  item.href === "/admin/sales/cash-sales" ||
                  item.href === "/admin/sales/credit-note" ||
                  item.href === "/admin/sales/delivery-return";

                if (!phaseTwoEnabled) {
                  return (
                    <div
                      key={item.href}
                      className="block cursor-not-allowed px-4 py-4 text-sm text-white/35"
                      title="This sales transaction will be developed in a later phase."
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
