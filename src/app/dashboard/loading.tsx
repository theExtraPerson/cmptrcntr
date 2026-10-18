function CardSkeleton({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`card-elevated animate-pulse bg-gray-200 ${className}`}
    >
      {children}
    </div>
  );
}

function ActionCardSkeleton() {
  return (
    <CardSkeleton className="flex min-h-28 flex-col items-center justify-center gap-3 p-4">
      <div className="h-7 w-7 rounded-lg bg-gray-300" />
      <div className="h-3 w-16 rounded-full bg-gray-300" />
    </CardSkeleton>
  );
}

function SectionHeadingSkeleton({ width = "w-28" }: { width?: string }) {
  return <div aria-hidden="true" className={`mb-2 h-5 animate-pulse rounded bg-gray-300 ${width}`} />;
}

export default function DashboardLoading() {
  return (
    <main
      aria-label="Loading dashboard"
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen px-4 pb-28 pt-5"
    >
      <span className="sr-only">Loading dashboard</span>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CardSkeleton className="h-11 w-11 shrink-0 rounded-2xl" />
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-300" />
            <div className="h-5 w-32 animate-pulse rounded bg-gray-300" />
          </div>
        </div>
        <div className="flex gap-2">
          <CardSkeleton className="h-8 w-20 rounded-full" />
          <CardSkeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>

      <CardSkeleton className="mb-6 h-40 rounded-2xl p-4">
        <div className="grid h-full grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2 pt-2">
              <div className="h-5 w-14 rounded bg-gray-300" />
              <div className="h-3 w-16 rounded bg-gray-300" />
            </div>
          ))}
          <div className="col-span-3 mx-auto h-6 w-28 rounded bg-gray-300" />
          <CardSkeleton className="h-10 rounded-xl" />
          <CardSkeleton className="h-10 rounded-xl" />
        </div>
      </CardSkeleton>

      <SectionHeadingSkeleton width="w-28" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }, (_, index) => <ActionCardSkeleton key={index} />)}
      </div>

      <SectionHeadingSkeleton width="w-20" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => <ActionCardSkeleton key={index} />)}
      </div>

      <SectionHeadingSkeleton width="w-20" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => <ActionCardSkeleton key={index} />)}
      </div>

      <SectionHeadingSkeleton width="w-32" />
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <CardSkeleton key={index} className="h-52 overflow-hidden rounded-2xl">
            <div className="h-32 bg-gray-300" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-2/5 rounded bg-gray-300" />
              <div className="h-3 w-full rounded bg-gray-300" />
              <div className="h-3 w-4/5 rounded bg-gray-300" />
            </div>
          </CardSkeleton>
        ))}
      </div>
      <CardSkeleton className="mt-5 h-12 rounded-xl" />

      <nav aria-hidden="true" className="bottom-nav mx-auto max-w-md">
        <div className="grid grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bottom-nav-item animate-pulse">
              <div className="h-[22px] w-[22px] rounded bg-gray-300" />
              <div className="h-3 w-12 rounded bg-gray-300" />
            </div>
          ))}
        </div>
      </nav>
    </main>
  );
}
