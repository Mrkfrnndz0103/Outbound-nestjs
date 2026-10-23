import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer, ShipWheel } from "lucide-react";
import { useState } from "react";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { statuses } from "../components/RequestFilters";
import { RequestTable } from "../components/RequestTable";
import { DockDialog } from "../components/request/DockDialog";
import { SkeletonTable } from "../components/SkeletonTable";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import { api } from "../lib/api";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import { openRequestsSheet } from "../lib/requests";
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
import type { Page, Status, TruckRequest, User } from "../types";

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
  const [lookupPage, setLookupPage] = useState(1);
  const [lookupSearch, setLookupSearch] = useState("");
  const lookup = useQuery({
    queryKey: [...requestQueryKey("docking"), "assigned-lookup", lookupPage, lookupSearch],
    queryFn: ({ signal }) => api<Page<TruckRequest>>(`/requests?status=DOCKING&per_page=20&page=${lookupPage}&search=${encodeURIComponent(lookupSearch.trim())}&sort=created_at&direction=desc`, { signal }),
    enabled: user.role === "doc_officer",
  });
  const [selected, setSelected] = useState<TruckRequest | null>(null);
  const [selectedAction, setSelectedAction] =
    useState<DockAction>("mark-docked");
  const [dockingChecked, setDockingChecked] = useState<Set<string>>(
    () => new Set(),
  );
  const [printable, setPrintable] = useState<TruckRequest | null>(null);
  const [operationId, setOperationId] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  function openDockDialog(request: TruckRequest, action: DockAction) {
    setOperationId(crypto.randomUUID());
    setSelectedAction(action);
    setSelected(request);
  }
  const requestQueue = {
    data: queue.hasData ? { data: queue.rows } : undefined,
    isPending: queue.isPending, isFetching: queue.isFetching, error: queue.error, refetch: queue.refetch,
  };
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
  const statusTabs = statuses.map((status) => ({
    status,
    count:
      status === "ALL"
        ? rows.length
        : rows.filter((row) => row.status === status).length,
  }));
  const visibleRows =
    statusFilter === "ALL"
      ? rows
      : rows.filter((row) => row.status === statusFilter);
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
                if (event.target.checked) queue.acknowledge(request.id, request);
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
              queue.acknowledge(request.id, request);
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
    <div className={`${workspaceViewClass} flex-col gap-4`}>
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
        <div className="relative z-20 flex min-w-0 flex-wrap items-center gap-3 border-b border-soc5-line bg-linehaul-surface-soft px-3 py-2 max-[680px]:items-stretch max-[680px]:gap-2 max-[680px]:p-2">
          <Tabs
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as Status | "ALL")}
            className="min-w-0 flex-1"
          >
            <TabsList
              className="h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-full bg-soc5-panel p-1 [scrollbar-width:thin]"
              aria-label="Docking request status tabs"
            >
              {statusTabs.map(({ status, count }) => (
                <TabsTrigger
                  key={status}
                  value={status}
                  className="h-8 shrink-0 rounded-full px-3 text-xs data-[state=active]:bg-soc5-ink data-[state=active]:text-soc5-panel"
                >
                  {status === "ALL" ? "All" : status.replaceAll("_", " ")}
                  <span className="grid size-5 place-items-center rounded-md bg-linehaul-surface-soft px-1 text-[10px] tabular-nums text-soc5-muted">
                    {count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <button
            type="button"
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-soc5-ink bg-soc5-ink px-4 py-1.5 text-sm font-medium text-soc5-panel transition-colors hover:bg-soc5-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linehaul-teal/40 max-[680px]:flex-1"
            onClick={openRequestsSheet}
          >
            <Download size={16} aria-hidden="true" />
            Export
          </button>
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
            rows={visibleRows}
            actions={actions}
            alertedIds={new Set(rows.filter(row => queue.isAlerting?.(row) ?? queue.alerts.some(alert => alert.id === row.id)).map(row => row.id))}
            emptyMessage={
              requestQueue.error
                ? "No docking records in the last successful update."
                : "No trucks are waiting for docking."
            }
          />
        ) : null}
        <nav aria-label="Docking queue pages" className="flex flex-wrap items-center justify-end gap-3 border-t border-soc5-line p-3 text-sm">
          <span>Page {queue.page}{queue.hasMore ? " — more requests available" : ""}</span>
          <button type="button" className={secondaryButtonClass} disabled={!queue.canPrevious || queue.isFetching}
            onClick={queue.previousPage} aria-label="Previous queue page">Previous</button>
          <button type="button" className={secondaryButtonClass} disabled={!queue.hasMore || queue.isFetching}
            onClick={queue.nextPage} aria-label="Next queue page">{queue.isFetching ? "Loading..." : "Next"}</button>
        </nav>
      </section>
      {user.role === "doc_officer" && (
        <section className={operationalPanelClass} aria-label="Assigned driver lookup">
          <div className={operationalPanelHeadClass}>
            <div>
              <h2 className={operationalPanelTitleClass}>Assigned driver lookup</h2>
              <p className={operationalPanelCopyClass}>Find docking trucks to reprint labels or reassign a driver.</p>
            </div>
            <label>Search docking trucks
              <input value={lookupSearch} onChange={(event) => { setLookupSearch(event.target.value); setLookupPage(1); }} />
            </label>
          </div>
          {lookup.error && <p role="alert">Unable to load assigned drivers. <button type="button" onClick={() => void lookup.refetch()}>Retry lookup</button></p>}
          {lookup.isPending ? <SkeletonTable columns={4} rows={4} compact /> : lookup.data && (
            <RequestTable rows={lookup.data.data.filter(row => Boolean(row.driver_id))} actions={actions}
              emptyMessage="No assigned drivers on this page. Search or check the next page." />
          )}
          <nav aria-label="Assigned driver lookup pages" className="flex items-center justify-end gap-3 p-3">
            <span>Page {lookupPage}</span>
            <button type="button" className={secondaryButtonClass} aria-label="Previous lookup page"
              disabled={lookupPage <= 1 || lookup.isFetching} onClick={() => setLookupPage(page => Math.max(1, page - 1))}>Previous</button>
            <button type="button" className={secondaryButtonClass} aria-label="Next lookup page"
              disabled={!lookup.data || lookupPage >= lookup.data.last_page || lookup.isFetching} onClick={() => setLookupPage(page => page + 1)}>Next</button>
          </nav>
        </section>
      )}
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
