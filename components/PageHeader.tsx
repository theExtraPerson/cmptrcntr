"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  right,
  back = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  back?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="gradient-mint sticky top-0 z-40 px-4 pb-5 pt-4 text-white">
      <div className="flex items-center gap-3">
        {back ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium">{title}</h1>
          {subtitle ? <p className="text-xs text-white/80">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}
