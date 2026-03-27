export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-10 text-sm text-white/55">
      <div className="container-rk flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} RK Motorsports. All rights reserved.</p>
        <p>Custom ECU tuning, file service workflow, admin delivery portal.</p>
      </div>
    </footer>
  );
}
