export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950/95 py-8 text-white/60">
      <div className="container-rk flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
        
        {/* LEFT */}
        <p>© 2026 RK Motorsports. All rights reserved.</p>

        {/* RIGHT */}
        <div className="text-right">
          <p className="text-white/50 text-sm">
            High-performance ECU tuning and custom file services.
          </p>
        </div>

      </div>
    </footer>
  );
}