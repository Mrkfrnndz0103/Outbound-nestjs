import { statusLabelFor } from "../lib/workflow";
import type { Status } from "../types";

const statusClassMap: Record<Status, string> = {
  REQUESTED:
    "border-current/20 bg-status-pending-surface text-status-pending-ink",
  REJECTED: "border-current/20 bg-status-danger-surface text-status-danger-ink",
  ASSIGNED: "border-current/20 bg-status-info-surface text-status-info-ink",
  CANCELLED:
    "border-current/20 bg-status-danger-surface text-status-danger-ink",
  DOCKING: "border-current/20 bg-status-info-surface text-status-info-ink",
  DOCKED: "border-current/20 bg-status-success-surface text-status-success-ink",
  PENDING:
    "border-status-pending-line bg-status-pending-surface text-status-pending-ink",
  REROUTED:
    "border-current/20 bg-status-pending-surface text-status-pending-ink",
};

const statusTextClassMap: Record<string, string> = {
  PENDING: "text-status-warning-ink",
  REQUESTED: "text-status-info-ink",
  REROUTED: "text-status-warning-ink",
  ASSIGNED: "text-linehaul-teal-ink",
  DOCKING: "text-status-docking-ink",
  DOCKED: "text-status-success-ink",
  CANCELLED: "text-status-danger-ink",
  REJECTED: "text-status-danger-ink",
};

const statusDotClassMap: Record<string, string> = {
  PENDING: "bg-[#d5a92d]",
  REQUESTED: "bg-[#4b91c2]",
  REROUTED: "bg-[#d5a92d]",
  ASSIGNED: "bg-[#36a59a]",
  DOCKING: "bg-[#8a70c4]",
  DOCKED: "bg-[#4aaf79]",
  CANCELLED: "bg-[#c76470]",
  REJECTED: "bg-[#c76470]",
};

export function StatusText({ status }: { status: string }) {
  const normalized = status === "FOR_DOCKING" ? "DOCKING" : status;
  const label = normalized.replaceAll("_", " ");

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-[.045em] ${statusTextClassMap[normalized] ?? "text-soc5-ink"}`}
    >
      <i
        className={`size-1.5 shrink-0 rounded-full ${statusDotClassMap[normalized] ?? "bg-[#899596]"}`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function StatusBadge({
  status,
  className,
  uppercase = false,
}: {
  status: Status;
  className?: string;
  uppercase?: boolean;
}) {
  return (
    <span
      className={`inline-block min-h-[22px] rounded-full border border-transparent px-2 py-[3px] text-xs leading-4 font-semibold ${statusClassMap[status]}${uppercase ? " uppercase" : ""}${className ? ` ${className}` : ""}`}
    >
      {statusLabelFor(status)}
    </span>
  );
}
