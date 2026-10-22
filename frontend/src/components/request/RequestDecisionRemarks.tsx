import { RequestCancellationRemarks } from "./RequestCancellationRemarks";

export function RequestDecisionRemarks({
  rejectionRemarks,
  cancellationRemarks,
}: {
  rejectionRemarks?: string | null;
  cancellationRemarks?: string | null;
}) {
  const rejection = rejectionRemarks?.trim();
  return (
    <>
      {rejection && (
        <section
          aria-label="Rejection remarks"
          className="rounded-md border border-status-danger-ink/20 bg-status-danger-surface p-3 text-status-danger-ink"
        >
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide">
            Rejection remarks
          </h3>
          <p className="mb-0 mt-1 whitespace-pre-wrap text-sm">{rejection}</p>
        </section>
      )}
      <RequestCancellationRemarks remarks={cancellationRemarks} />
    </>
  );
}
