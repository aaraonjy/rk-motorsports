"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const activeItems = [
  { label: "Product List", href: "/admin/products" },
  { label: "Product Group", href: "/admin/product-groups" },
  { label: "Product Sub-Group", href: "/admin/product-sub-groups" },
  { label: "Product Brand", href: "/admin/brands" },
  { label: "Stock Location", href: "/admin/stock/locations" },
] as const;

const upcomingItems = [
  "Serial No",
  "Opening Stock",
  "Stock Receive",
  "Stock Issue",
  "Stock Adjustment",
] as const;

export function AdminStockMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive =
    pathname.startsWith("/admin/products") ||
    pathname.startsWith("/admin/product-groups") ||
    pathname.startsWith("/admin/product-sub-groups") ||
    pathname.startsWith("/admin/brands") ||
    pathname.startsWith("/admin/stock/locations");

  return (
    <div ref={dropdownRef} className="relative">
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} className={`inline-flex items-center gap-2 text-sm font-medium transition hover:text-white ${isActive ? "text-white" : "text-white/80"}`}>
        <span>Stock</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+12px)] z-[70] min-w-[250px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0c]/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">Batch A</div>
          {activeItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`block px-4 py-4 text-sm transition hover:bg-white/10 hover:text-white ${active ? "bg-white/10 text-white" : "text-white/85"}`} onClick={() => setIsOpen(false)}>
                {item.label}
              </Link>
            );
          })}
          <div className="border-t border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Coming Soon</div>
          <div className="grid gap-1 px-2 py-2">
            {upcomingItems.map((label) => <div key={label} className="rounded-xl px-3 py-2 text-sm text-white/35">{label}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
