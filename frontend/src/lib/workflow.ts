import type { Role, Status } from "../types";

export type WorkflowAction =
  | "approve"
  | "reject-ops"
  | "reject-mm"
  | "cancel"
  | "assign-truck"
  | "mark-docked"
  | "reassign-driver";

export const WORKFLOW_ACTIONS = {
  approve: "approve",
  rejectOps: "reject-ops",
  rejectMm: "reject-mm",
  cancel: "cancel",
  assignTruck: "assign-truck",
  markDocked: "mark-docked",
  reassignDriver: "reassign-driver",
} as const satisfies Record<string, WorkflowAction>;

const statusLabels: Record<Status, string> = {
  PENDING: "Pending",
  REQUESTED: "Requested",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  REROUTED: "Rerouted",
  ASSIGNED: "Assigned",
  DOCKING: "Docking",
  DOCKED: "Docked",
};

export function statusLabelFor(status: string): string {
  const normalized = status === "FOR_DOCKING" ? "DOCKING" : status;
  return statusLabels[normalized as Status] ?? normalized.replaceAll("_", " ");
}

export function workflowActionPath(
  requestId: string,
  action: WorkflowAction,
): string {
  return `/requests/${requestId}/${action}`;
}

export function nextActionLabelFor(role: Role | null | undefined): string {
  switch (role) {
    case "fte_ops":
      return "FTE Ops: review request";
    case "fte_mm":
      return "FTE MM: assign truck";
    case "doc_officer":
      return "DOC Officer: assign driver";
    case "ops_pic":
      return "OPS PIC: confirm trip";
    default:
      return "No action pending";
  }
}
