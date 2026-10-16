export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "approved" || status === "APPROVED" || status === "SUCCESS"
      ? "bg-green-100 text-green-700"
      : status === "rejected" || status === "FAILED" || status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : status === "PROCESSING"
          ? "bg-blue-100 text-blue-700"
          : "bg-amber-100 text-amber-700";
  const label = status === "SUCCESS" ? "Paid" : status.toLowerCase();
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${color}`}>{label}</span>;
}
