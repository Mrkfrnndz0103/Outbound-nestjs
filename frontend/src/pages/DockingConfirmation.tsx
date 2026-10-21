import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, ShipWheel } from "lucide-react";
import { useState } from "react";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { RequestTable } from "../components/RequestTable";
import { DockDialog } from "../components/request/DockDialog";
import { SkeletonTable } from "../components/SkeletonTable";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import { api } from "../lib/api";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import { requestQueryKey } from "../lib/requestRefresh";
import {
  loadingChipClass,
  loadingShellClass,
  loadingToolbarClass,
  operationalPanelClass,
  operationalPanelCopyClass,
  operationalPanelHeadClass,
  operationalPanelTitleClass,
  primaryTableActionClass,
  secondaryButtonClass,
  tableActionClass,
  workspaceViewClass,
} from "../lib/uiClasses";
import { type WorkflowAction, workflowActionPath } from "../lib/workflow";
import type { TruckRequest, User } from "../types";

type DockAction = Extract<WorkflowAction, "mark-docked" | "reassign-driver">;

export function canShowDriverAssignment(
  request: Pick<TruckRequest, "status" | "driver_id">,
  dockingChecked: boolean,
) {
  return request.status === "DOCKING" && !request.driver_id && dockingChecked;
}
export function canShowTripAssignment(
  request: Pick<TruckRequest, "status" | "driver_id">,
  role: User["role"],
) {
  return (
    role === "ops_pic" &&
    request.status === "DOCKING" &&
    Boolean(request.driver_id)
  );
}

export function DockingConfirmation({
  user,
  queue,
}: {
  user: User;
  queue: QueueSnapshot;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<TruckRequest | null>(null);
  const [selectedAction, setSelectedAction] =
    useState<DockAction>("mark-docked");
  const [dockingChecked, setDockingChecked] = useState<Set<string>>(
    () => new Set(),
  );
  const [printable, setPrintable] = useState<TruckRequest | null>(null);
  const [operationId, setOperationId] = useState("");
  function openDockDialog(request: TruckRequest, action: DockAction) {
    setOperationId(crypto.randomUUID());
    setSelectedAction(action);
    setSelected(request);
  }
  const requestQueue = useQuery({
    queryKey: ["requests", "docking"],
    queryFn: () =>
      api<{ data: TruckRequest[]; limit: number }>("/requests/queue?limit=100"),
    enabled: user.role === "doc_officer" || user.role === "ops_pic",
    staleTime: 30_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const action = useMutation({
    mutationFn: ({
      request,
      action,
      payload,
      operationId,
    }: {
      request: TruckRequest;
      action: DockAction;
      payload?: Record<string, unknown>;
      operationId: string;
    }) =>
      api<TruckRequest>(workflowActionPath(request.id, action), {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        headers: buildIdempotencyHeaders(`docking-${action}`, {
          requestId: request.id,
          action,
          operationId,
          payload: payload ?? {},
        }),
      }),
    onSuccess: async (updated, variables) => {
      setSelected(null);
      setSelectedAction("mark-docked");
      if (user.role === "doc_officer") setPrintable(updated);
      if (variables.action === "mark-docked" && user.role === "ops_pic")
        setPrintable(updated);
      await client.invalidateQueries({ queryKey: requestQueryKey("docking") });
      await client.invalidateQueries({
        queryKey: requestQueryKey("dashboard"),
      });
      await client.invalidateQueries({
        queryKey: requestQueryKey("notification-queue"),
      });
    },
  });
  const rows = requestQueue.data?.data ?? [];
  const actions = (request: TruckRequest) => (
    <>
      <button
        type="button"
        className={tableActionClass}
        disabled={!request.driver_id?.trim()}
        onClick={() => setPrintable(request)}
      >
        <Printer size={15} />
        Print
      </button>
      {request.status === "DOCKING" &&
        user.role === "doc_officer" &&
        !request.driver_id && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-soc5-muted">
            <input
              type="checkbox"
              checked={dockingChecked.has(request.id)}
              onChange={(event) => {
                if (event.target.checked) queue.acknowledge(request.id);
                setDockingChecked((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(request.id);
                  else next.delete(request.id);
                  return next;
                });
              }}
              aria-label={`Confirm docking for ${request.id}`}
            />
            Docking
          </label>
        )}
      {user.role === "doc_officer" &&
        canShowDriverAssignment(request, dockingChecked.has(request.id)) && (
          <button
            type="button"
            className={primaryTableActionClass}
            disabled={action.isPending}
            onClick={() => {
              queue.acknowledge(request.id);
              openDockDialog(request, "mark-docked");
            }}
          >
            <ShipWheel size={15} />
            Assign Driver ID
          </button>
        )}
      {user.role === "doc_officer" &&
        request.status === "DOCKING" &&
        Boolean(request.driver_id) && (
          <button
            type="button"
            className={tableActionClass}
            disabled={action.isPending}
            onClick={() => openDockDialog(request, "reassign-driver")}
          >
            Reassign Driver ID
          </button>
        )}
      {canShowTripAssignment(request, user.role) && (
        <button
          type="button"
          className={primaryTableActionClass}
          disabled={action.isPending}
          onClick={() => openDockDialog(request, "mark-docked")}
        >
          <ShipWheel size={15} />
          Enter LHTrip #
        </button>
      )}
    </>
  );

  return (
    <div className={workspaceViewClass}>
      {action.error && (
        <p className="notice error text-[var(--color-danger)]">
          {action.error.message}
        </p>
      )}
      <section className={operationalPanelClass}>
        <div className={operationalPanelHeadClass}>
          <div>
            <h2 className={operationalPanelTitleClass}>Docking queue</h2>
            <p className={operationalPanelCopyClass}>
              Assigned trucks requiring dock action or final confirmation
            </p>
          </div>
        </div>
        {requestQueue.error && (
          <div
            role="alert"
            className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger-ink/20 bg-status-danger-surface p-4 text-sm text-soc5-ink"
          >
            <div>
              <p className="font-semibold">
                {requestQueue.data
                  ? "Unable to refresh the docking queue"
                  : "Unable to load the docking queue"}
              </p>
              <p className="mt-1">
                {requestQueue.data
                  ? "Showing the last successful update. These records may be outdated."
                  : "The queue is unavailable. Retry to check for trucks awaiting docking."}
              </p>
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={requestQueue.isFetching}
              aria-busy={requestQueue.isFetching}
              onClick={() => void requestQueue.refetch()}
            >
              {requestQueue.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
        {requestQueue.isPending ? (
          <div className={loadingShellClass}>
            <div className={loadingToolbarClass}>
              <span className={loadingChipClass} />
              <span className={loadingChipClass} />
            </div>
            <SkeletonTable columns={4} rows={4} compact />
          </div>
        ) : requestQueue.data ? (
          <RequestTable
            rows={rows}
            actions={actions}
            alertedIds={new Set(queue.alerts.map((alert) => alert.id))}
            emptyMessage={
              requestQueue.error
                ? "No docking records in the last successful update."
                : "No trucks are waiting for docking."
            }
          />
        ) : null}
      </section>
      {selected && (
        <DockDialog
          request={selected}
          actorRole={user.role}
          action={selectedAction}
          busy={action.isPending}
          onClose={() => {
            setSelected(null);
            setSelectedAction("mark-docked");
          }}
          onSubmit={(payload) =>
            action.mutate({
              request: selected,
              action: selectedAction,
              operationId,
              payload,
            })
          }
        />
      )}
      {printable && (
        <PrintableTruckLabel
          request={printable}
          onClose={() => setPrintable(null)}
        />
      )}
    </div>
  );
}
