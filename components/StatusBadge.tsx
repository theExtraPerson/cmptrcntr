export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "approved"
      ? "bg-green-100 text-green-700"
      : status === "rejected"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${color}`}>{status}</span>;
}
