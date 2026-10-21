import type { ApprovalStatus, Status } from "../../types";

type ApprovalState =
  | "pending"
  | "routing"
  | "approved"
  | "rejected"
  | "cancelled";

const labels: Record<ApprovalState, string> = {
  pending: "Approval pending",
  routing: "Rerouting",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const classes: Record<ApprovalState, string> = {
  pending:
    "border-status-pending-line bg-status-pending-surface text-status-pending-ink",
  routing: "border-current/20 bg-status-info-surface text-status-info-ink",
  approved:
    "border-current/20 bg-status-success-surface text-status-success-ink",
  rejected: "border-current/20 bg-status-danger-surface text-status-danger-ink",
  cancelled:
    "border-current/20 bg-status-pending-surface text-status-pending-ink",
};

export function approvalStateFor(
  status: Status,
  approvalStatus?: ApprovalStatus | null,
): ApprovalState {
  if (approvalStatus === "APPROVED") return "approved";
  if (approvalStatus === "REJECTED") return "rejected";
  if (approvalStatus === "CANCELLED") return "cancelled";
  if (status === "REROUTED") return "routing";
  return "pending";
}

export function ApprovalStateBadge({
  status,
  approvalStatus,
}: {
  status: Status;
  approvalStatus?: ApprovalStatus | null;
}) {
  const state = approvalStateFor(status, approvalStatus);

  return (
    <span
      className={`inline-block min-h-[22px] rounded-full border px-2 py-[3px] text-xs leading-4 font-semibold ${classes[state]}`}
    >
      {labels[state]}
    </span>
  );
}
