import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RK Motorsports",
  description: "Custom ECU tuning workflow portal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-[url('/background1.jpeg')] bg-cover bg-center bg-no-repeat text-white">
        <div className="flex min-h-screen flex-col bg-gradient-to-b from-black/75 via-black/65 to-black/85">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}