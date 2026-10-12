import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, ShipWheel, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Modal } from "../components/Modal";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { RequestTable } from "../components/RequestTable";
import { SkeletonTable } from "../components/SkeletonTable";
import { api } from "../lib/api";
import { requestQueryKey } from "../lib/requestRefresh";
import { compactFormDialogClass, dialogActionsClass, dialogFormClass, dialogHeadClass, dialogInputClass, dialogLabelClass, iconButtonClass, loadingChipClass, loadingShellClass, loadingToolbarClass, operationalPanelClass, operationalPanelCopyClass, operationalPanelHeadClass, operationalPanelTitleClass, primaryTableActionClass, secondaryButtonClass, tableActionClass, workspaceViewClass } from "../lib/uiClasses";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import type { Page, TruckRequest, User } from "../types";

type DockAction = "mark-docked";

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
  return role === "ops_pic" && request.status === "DOCKING" && Boolean(request.driver_id);
}

export function DockingConfirmation({ user }: { user: User }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<TruckRequest | null>(null);
  const [dockingChecked, setDockingChecked] = useState<Set<string>>(() => new Set());
  const [printable, setPrintable] = useState<TruckRequest | null>(null);
  const queue = useQuery({
    queryKey: ["requests", "docking"],
    queryFn: () =>
      api<Page<TruckRequest>>(
        "/requests?per_page=100&sort=created_at&direction=desc",
      ),
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
    }: {
      request: TruckRequest;
      action: DockAction;
      payload?: Record<string, unknown>;
    }) =>
      api<TruckRequest>(`/requests/${request.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
        headers: buildIdempotencyHeaders(`docking-${action}`, {
          requestId: request.id,
          action,
          payload: payload ?? {},
        }),
      }),
    onSuccess: async (updated, variables) => {
      setSelected(null);
      if (variables.action === "mark-docked" && user.role === "ops_pic") setPrintable(updated);
      await client.invalidateQueries({ queryKey: requestQueryKey("docking") });
      await client.invalidateQueries({ queryKey: requestQueryKey("dashboard") });
      await client.invalidateQueries({ queryKey: requestQueryKey("notification-queue") });
    },
  });
  const rows = (queue.data?.data ?? []).filter(
    (request) =>
      request.status === "DOCKING" || request.status === "DOCKED",
  );
  const actions = (request: TruckRequest) => (
    <>
      <button
        type="button"
        className={tableActionClass}
        onClick={() => setPrintable(request)}
      >
        <Printer size={15} />
        Print
      </button>
      {request.status === "DOCKING" && user.role === "doc_officer" && !request.driver_id && (
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-soc5-muted">
          <input
            type="checkbox"
            checked={dockingChecked.has(request.id)}
            onChange={(event) => setDockingChecked((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(request.id);
              else next.delete(request.id);
              return next;
            })}
            aria-label={`Confirm docking for ${request.id}`}
          />
          Docking
        </label>
      )}
      {user.role === "doc_officer" && canShowDriverAssignment(request, dockingChecked.has(request.id)) && (
        <button
          type="button"
          className={primaryTableActionClass}
          disabled={action.isPending}
          onClick={() => setSelected(request)}
        >
          <ShipWheel size={15} />
          Assigned
        </button>
      )}
      {canShowTripAssignment(request, user.role) && (
        <button
          type="button"
          className={primaryTableActionClass}
          disabled={action.isPending}
          onClick={() => setSelected(request)}
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
            <p className={operationalPanelCopyClass}>Assigned trucks requiring dock action or final confirmation</p>
          </div>
        </div>
        {queue.error && (
          <div
            role="alert"
            className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger-ink/20 bg-status-danger-surface p-4 text-sm text-soc5-ink"
          >
            <div>
              <p className="font-semibold">
                {queue.data
                  ? "Unable to refresh the docking queue"
                  : "Unable to load the docking queue"}
              </p>
              <p className="mt-1">
                {queue.data
                  ? "Showing the last successful update. These records may be outdated."
                  : "The queue is unavailable. Retry to check for trucks awaiting docking."}
              </p>
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={queue.isFetching}
              aria-busy={queue.isFetching}
              onClick={() => void queue.refetch()}
            >
              {queue.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
        {queue.isPending ? (
          <div className={loadingShellClass}>
            <div className={loadingToolbarClass}>
              <span className={loadingChipClass} />
              <span className={loadingChipClass} />
            </div>
            <SkeletonTable columns={4} rows={4} compact />
          </div>
        ) : queue.data ? (
          <RequestTable
            rows={rows}
            actions={actions}
            emptyMessage={queue.error
              ? "No docking records in the last successful update."
              : "No trucks are waiting for docking."}
          />
        ) : null}
      </section>
      {selected && (
        <DockDialog
          request={selected}
          role={user.role}
          busy={action.isPending}
          onClose={() => setSelected(null)}
          onSubmit={(payload) =>
            action.mutate({ request: selected, action: "mark-docked", payload })
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

function DockDialog({
  request,
  role,
  busy,
  onClose,
  onSubmit,
}: {
  request: TruckRequest;
  role: User["role"];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(
      role === "doc_officer"
        ? { driver_id: data.get("driver_id") }
        : { linehaul_trip_no: data.get("linehaul_trip_no") },
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      className={compactFormDialogClass}
      role="dialog"
      ariaLabel={`Dock truck for ${request.cluster}`}
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-semibold tracking-wide uppercase">
            {request.cluster}
          </p>
          <h2>Dock truck</h2>
        </div>
        <button
          className={iconButtonClass}
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        {role === "doc_officer" ? (
          <label className={dialogLabelClass}>
            Driver ID
            <input
              name="driver_id"
              required
              className={dialogInputClass}
              defaultValue={request.driver_id ?? ""}
            />
          </label>
        ) : (
          <label className={dialogLabelClass}>
            LH Trip Number
            <input
              name="linehaul_trip_no"
              required
              className={dialogInputClass}
              defaultValue={request.linehaul_trip_no ?? ""}
            />
          </label>
        )}
        <div className={dialogActionsClass}>
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : role === "doc_officer" ? "Assigned" : "Docked"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
