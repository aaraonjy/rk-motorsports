import Link from "next/link";

type PaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  page: number,
  params?: Record<string, string | undefined>
) {
  const searchParams = new URLSearchParams();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        searchParams.set(key, value);
      }
    }
  }

  searchParams.set("page", String(page));

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage]);

  if (currentPage - 1 > 1) pages.add(currentPage - 1);
  if (currentPage + 1 < totalPages) pages.add(currentPage + 1);

  if (currentPage <= 2) pages.add(3);
  if (currentPage >= totalPages - 1) pages.add(totalPages - 2);

  return [...pages].sort((a, b) => a - b);
}

export function PaginationControls({
  currentPage,
  totalPages,
  basePath,
  params,
}: PaginationControlsProps) {
  const showControls = totalPages > 1;
  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-white/60">
        Page <span className="font-medium text-white">{currentPage}</span> of{" "}
        <span className="font-medium text-white">{totalPages}</span>
      </div>

      {showControls ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(basePath, Math.max(1, currentPage - 1), params)}
            aria-disabled={currentPage === 1}
            className={`rounded-xl border px-4 py-2 text-sm transition ${
              currentPage === 1
                ? "pointer-events-none border-white/10 text-white/25"
                : "border-white/15 text-white/80 hover:bg-white/10"
            }`}
          >
            Previous
          </Link>

          {visiblePages.map((page, index) => {
            const prev = visiblePages[index - 1];
            const showGap = prev && page - prev > 1;

            return (
              <div key={page} className="flex items-center gap-2">
                {showGap ? <span className="px-1 text-white/35">...</span> : null}
                <Link
                  href={buildHref(basePath, page, params)}
                  className={`min-w-[42px] rounded-xl border px-3 py-2 text-center text-sm transition ${
                    currentPage === page
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-white/15 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {page}
                </Link>
              </div>
            );
          })}

          <Link
            href={buildHref(
              basePath,
              Math.min(totalPages, currentPage + 1),
              params
            )}
            aria-disabled={currentPage === totalPages}
            className={`rounded-xl border px-4 py-2 text-sm transition ${
              currentPage === totalPages
                ? "pointer-events-none border-white/10 text-white/25"
                : "border-white/15 text-white/80 hover:bg-white/10"
            }`}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}