export function RequestCancellationRemarks({
  remarks,
}: {
  remarks?: string | null;
}) {
  const savedRemarks = remarks?.trim();
  if (!savedRemarks) return null;

  return (
    <section
      aria-label="Cancellation remarks"
      className="rounded-md border border-status-danger-ink/20 bg-status-danger-surface p-3 text-status-danger-ink"
    >
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide">
        Cancellation remarks
      </h3>
      <p className="mb-0 mt-1 whitespace-pre-wrap text-sm">{savedRemarks}</p>
    </section>
  );
}
