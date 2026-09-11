"use client";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center">
      <button className="absolute inset-0" aria-label="Close" type="button" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium">{title}</h3>
          <button type="button" className="text-sm text-muted-foreground" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
