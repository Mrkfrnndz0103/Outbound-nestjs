import {
  RequestDetailRow,
  RequestRecordHead,
  RequestRecordRow,
} from "../components/request/RequestRecordTable";
import { RequestFetchNotice } from "../components/request/RequestFetchNotice";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CircleCheck,
  Clock3,
  Hash,
  LayoutGrid,
  ListChecks,
  Printer,
  RefreshCw,
  Table2,
  Truck,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { textButtonClass } from "../lib/uiClasses";
import {
  compactRequestRowClass,
  recordsScrollClass,
  recordsTableClass,
  requestAssignClass,
  requestCheckboxClass,
  requestExpandedRowClass,
  requestPageClass,
  requestRejectClass,
  requestRowClass,
  requestSelectedRowClass,
  requestTableBodyClass,
  requestToolbarIconClass,
  requestViewToggleClass,
  requestWorkspaceClass,
  selectedRequestActionsClass,
  selectedRequestLabelClass,
  tableShellClass,
} from "../lib/uiClasses";
import {
  linehaulColumnOptions,
  linehaulPrimaryColumnKeysForRole,
} from "../components/ColumnVisibilityMenu";
import { LhTableToolbar } from "../components/LhTableToolbar";
import { LhRowActionMenu } from "../components/LhRowActionMenu";
import { MidmileActionDialog } from "../components/request/MidmileActionDialog";
import { Pagination } from "../components/Pagination";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { SkeletonCardList, SkeletonRequestTable } from "../components/Skeleton";
import { StatusBadge, StatusText } from "../components/StatusBadge";
import { RequestElapsedTime } from "../components/RequestTable";
import { RequestExpandButton } from "../components/request/RequestExpandButton";
import { RequestExpandedDetails } from "../components/request/RequestExpandedDetails";
import {
  displayRequestValue as displayValue,
  displayRequestActor,
  formatRequestDateTime as formatDateTime,
  formatRequestDetailDateTime as formatDetailDateTime,
} from "../components/request/requestPresentation";
import { useRequestFilters } from "../hooks/useRequestFilters";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import { useLinehaulTablePreferences } from "../hooks/useLinehaulTablePreferences";
import { api, apiErrorMessage } from "../lib/api";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import { requestQueryKey } from "../lib/requestRefresh";
import { workflowActionPath, type WorkflowAction } from "../lib/workflow";
import {
  openRequestsSheet,
  requestQueryString,
} from "../lib/requests";
import type { Page, RequestSort, TruckRequest, User } from "../types";

type MmAction = Extract<WorkflowAction, "assign-truck" | "reject-mm">;

function _formatCluster(value: string) {
  return value
    .split(",")
    .map((cluster) => cluster.trim())
    .filter(Boolean)
    .join(" · ");
}

function shouldRenderExpandedField(
  fieldKey: string,
  visibleColumns: readonly string[],
) {
  return !visibleColumns.includes(fieldKey);
}

function _expandedRequestGroups(
  row: TruckRequest,
  visibleColumns: readonly string[],
) {
  const groups = [
    {
      title: "Timing",
      fields: [
        {
          key: "backlogsTime",
          label: "Backlogs Time Stamp",
          value: formatDetailDateTime(row.backlogs_timestamp),
        },
        {
          key: "provideTime",
          label: "Provide Time",
          value: formatDetailDateTime(row.provide_time),
        },
        {
          key: "assignedTime",
          label: "Assigned Time",
          value: formatDetailDateTime(row.driver_assigned_at),
        },
      ],
    },
    {
      title: "Assignment",
      fields: [
        {
          key: "opsFte",
          label: "SOC PIC \u00b7 FTE Ops",
          value: displayValue(row.ob_fte_name ?? row.ob_fte),
        },
        {
          key: "mmFte",
          label: "MM FTE",
          value: displayRequestActor(row.mm_fte_name, row.mm_fte_id),
        },
        {
          key: "opsPic",
          label: "OPS PIC",
          value: displayValue(row.ob_fte_name ?? row.ob_fte),
        },
      ],
    },
    {
      title: "Operations",
      fields: [
        {
          key: "lhTypeRequest",
          label: "Truck Type",
          value: displayValue(row.truck_type),
        },
        {
          key: "lhTypeInput",
          label: "LH Type (input by FTE MM)",
          value: "Same as Truck Type",
        },
        {
          key: "docOfficer",
          label: "Doc Officer",
          value: displayRequestActor(row.doc_officer_name, row.doc_officer_id),
        },
      ],
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter(({ key }) =>
        shouldRenderExpandedField(key, visibleColumns),
      ),
    }))
    .filter((group) => group.fields.length > 0);
}

export function MidmileRequests({ user, queue }: { user: User; queue: QueueSnapshot }) {
  const queryClient = useQueryClient();
  const { filters, appliedFilters, setFilters, changeFilters } =
    useRequestFilters();
  const [selected, setSelected] = useState<{
    request: TruckRequest;
    action: MmAction;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const modalTrigger = useRef<HTMLElement | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "card">("table");
  const [printRequest, setPrintRequest] = useState<TruckRequest | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const { visibleColumns, updateColumns, density, setDensity } =
    useLinehaulTablePreferences(
      "midmile",
      linehaulColumnOptions.map(({ key }) => key),
      linehaulPrimaryColumnKeysForRole(user.role),
    );
  const hasColumn = (key: string) =>
    (visibleColumns as readonly string[]).includes(key);
  const requests = useQuery({
    queryKey: ["requests", "midmile-all", appliedFilters],
    queryFn: () =>
      api<Page<TruckRequest>>(
        `/requests?${requestQueryString(appliedFilters)}`,
      ),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: user.role === "fte_mm",
  });

  function toggleSelected(id: string) {
    queue.acknowledge(id);
    setSelectedIds((current) => {
      if (current.has(id)) return new Set();
      return new Set([id]);
    });
  }
  const selectedRequest = (requests.data?.data ?? []).find((row) =>
    selectedIds.has(row.id),
  );
  const transition = useMutation({
    mutationFn: ({
      request,
      action,
      payload,
    }: {
      request: TruckRequest;
      action: MmAction;
      payload: Record<string, unknown>;
    }) =>
      api<TruckRequest>(workflowActionPath(request.id, action), {
        method: "POST",
        body: JSON.stringify(payload),
        headers: buildIdempotencyHeaders(`midmile-${action}`, {
          requestId: request.id,
          action,
          payload,
        }),
      }),
    onSuccess: async (_, variables) => {
      setSelected(null);
      setNotice(
        variables.action === "assign-truck"
          ? "Truck confirmed."
          : "Request returned to Outbound.",
      );
      await queryClient.invalidateQueries({
        queryKey: requestQueryKey("midmile-all"),
      });
      await queryClient.invalidateQueries({
        queryKey: requestQueryKey("outbound-all"),
      });
      await queryClient.invalidateQueries({
        queryKey: requestQueryKey("notification-queue"),
      });
      await queryClient.invalidateQueries({ queryKey: ["request-metrics"] });
    },
  });

  function sortBy(sort: RequestSort) {
    setFilters((value) => ({
      ...value,
      sort,
      direction:
        value.sort === sort && value.direction === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }
  function exportSheet() {
    if (exporting) return;
    setExporting(true);
    openRequestsSheet();
    window.setTimeout(() => setExporting(false), 700);
  }
  const emptyMessage = requests.isFetching || requests.error || requests.isPlaceholderData
    ? "No requests in the last successful results."
    : "No live requests match the current filters.";

  return (
    <div className={`${requestPageClass}${selected ? " lh-drawer-open" : ""}`}>
      <section
        className={requestWorkspaceClass}
        aria-label="Midmile linehaul requests"
      >
        {(notice || transition.error) && (
          <p
            className={`notice${transition.error || notice.includes("failed") ? " error text-(--color-danger)" : " success-notice"}`}
          >
            {transition.error?.message || notice}
          </p>
        )}

        {printRequest && (
          <PrintableTruckLabel
            request={printRequest}
            returnFocus={modalTrigger.current}
            onClose={() => setPrintRequest(null)}
          />
        )}

        <section
          className={tableShellClass}
          aria-label="Midmile linehaul request records"
        >
          <div className="relative z-20 flex min-w-0 flex-wrap items-center justify-start gap-2 border-b border-soc5-line bg-linehaul-surface-soft px-2.5 py-1.5 max-[680px]:flex-col max-[680px]:items-stretch max-[680px]:gap-1.5 max-[680px]:p-[.45rem]">
            <LhTableToolbar
              filters={filters}
              onChange={changeFilters}
              onSort={sortBy}
              onExport={exportSheet}
              showCreateNew={false}
              onNotice={setNotice}
              visibleColumns={visibleColumns}
              onColumnsChange={updateColumns}
              density={density}
              onDensityChange={setDensity}
              exporting={exporting}
              lastUpdated={requests.dataUpdatedAt}
            />
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                className={`${requestToolbarIconClass}${requests.isFetching ? " animate-spin" : ""}`}
                type="button"
                aria-label={
                  requests.isFetching ? "Refreshing records" : "Refresh records"
                }
                title={
                  requests.isFetching ? "Refreshing records" : "Refresh records"
                }
                aria-busy={requests.isFetching}
                disabled={requests.isFetching}
                onClick={() => void requests.refetch()}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {selectedRequest && (
                <fieldset
                  className={`${selectedRequestActionsClass} m-0 border-0 p-0`}
                  aria-label="Selected request actions"
                >
                  <span className={selectedRequestLabelClass}>
                    Selected request
                  </span>
                  <button
                    className={requestAssignClass}
                    type="button"
                    onClick={(event) => {
                      modalTrigger.current = event.currentTarget;
                      setSelected({
                        request: selectedRequest,
                        action: "assign-truck",
                      });
                    }}
                  >
                    Assign
                  </button>
                  <button
                    className={requestRejectClass}
                    type="button"
                    onClick={(event) => {
                      modalTrigger.current = event.currentTarget;
                      setSelected({
                        request: selectedRequest,
                        action: "reject-mm",
                      });
                    }}
                  >
                    Reject
                  </button>
                </fieldset>
              )}
              <fieldset
                className={`${requestViewToggleClass} m-0 border-0 p-0`}
                aria-label="Request view"
              >
                <button
                  className={requestToolbarIconClass}
                  type="button"
                  aria-label="Table view"
                  title="Table view"
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                >
                  <Table2 size={16} aria-hidden="true" />
                </button>
                <button
                  className={requestToolbarIconClass}
                  type="button"
                  aria-label="Card view"
                  title="Card view"
                  aria-pressed={view === "card"}
                  onClick={() => setView("card")}
                >
                  <LayoutGrid size={16} aria-hidden="true" />
                </button>
              </fieldset>
            </div>
            <RequestFetchNotice
              hasData={requests.data !== undefined}
              fetching={requests.isFetching}
              previousFilters={requests.isPlaceholderData}
              error={requests.error}
              onRetry={() => void requests.refetch()}
            />
          </div>
          {view === "table" ? (
            <div className={recordsScrollClass}>
              <table
                aria-label="Request records"
                className={recordsTableClass}
                style={{
                  gridTemplateColumns: `5rem repeat(${visibleColumns.length}, minmax(7rem, 1fr)) 4rem`,
                  minWidth: `${visibleColumns.length * 7 + 9}rem`,
                }}
              >
                <RequestRecordHead
                  sort={filters.sort}
                  direction={filters.direction}
                >
                  <span>
                    <span className="sr-only">Row controls</span>
                  </span>
                  {hasColumn("status") && (
                    <span className="flex items-center gap-2">
                      <CircleCheck size={14} />
                      Status
                    </span>
                  )}
                  {hasColumn("runningTime") && (
                    <span className="flex items-center gap-2">
                      <Clock3 size={14} />
                      Running time
                    </span>
                  )}
                  {hasColumn("requestTime") && (
                    <button
                      type="button"
                      data-sort="request_timestamp"
                      onClick={() => sortBy("request_timestamp")}
                    >
                      <Clock3 size={14} />
                      <span>Request Time</span>
                    </button>
                  )}
                  {hasColumn("cluster") && (
                    <button
                      type="button"
                      data-sort="cluster"
                      onClick={() => sortBy("cluster")}
                    >
                      <Hash size={14} />
                      <span>Cluster</span>
                    </button>
                  )}
                  {hasColumn("region") && (
                    <span>
                      <BadgeCheck size={14} />
                      Region
                    </span>
                  )}
                  {hasColumn("dock") && (
                    <button
                      type="button"
                      data-sort="dock_no"
                      onClick={() => sortBy("dock_no")}
                    >
                      <Truck size={14} />
                      <span>Dock #</span>
                    </button>
                  )}
                  {hasColumn("backlogs") && (
                    <button
                      type="button"
                      data-sort="backlogs"
                      onClick={() => sortBy("backlogs")}
                    >
                      <ListChecks size={14} />
                      <span>Backlogs</span>
                    </button>
                  )}
                  {hasColumn("backlogsTime") && (
                    <span>Backlogs Time Stamp</span>
                  )}
                  {hasColumn("lhTypeRequest") && <span>LH Type (Request)</span>}
                  {hasColumn("opsFte") && <span>Ops FTE</span>}
                  {hasColumn("plateNumber") && (
                    <button
                      type="button"
                      data-sort="plate_number"
                      onClick={() => sortBy("plate_number")}
                    >
                      <Hash size={14} />
                      <span>Plate number</span>
                    </button>
                  )}
                  {hasColumn("mmFte") && <span>MM FTE</span>}
                  {hasColumn("truckSize") && (
                    <span>
                      <Truck size={14} />
                      LH Size
                    </span>
                  )}
                  {hasColumn("lhTypeInput") && (
                    <span>LH type (input by FTE MM)</span>
                  )}
                  {hasColumn("provideTime") && <span>Provide Time</span>}
                  {hasColumn("linehaulTrip") && <span>Linehaul Trip</span>}
                  {hasColumn("assignedTime") && <span>Assigned time</span>}
                  {hasColumn("dockedTime") && <span>Docked Time</span>}
                  {hasColumn("docOfficer") && <span>DOC Officer</span>}
                  {hasColumn("opsPic") && <span>OPS/PIC</span>}
                  <span>
                    <span className="sr-only">Actions</span>
                  </span>
                </RequestRecordHead>
                <tbody className={requestTableBodyClass}>
                  {requests.isPending && (
                    <RequestDetailRow columns={visibleColumns.length + 2}>
                      <SkeletonRequestTable
                        rows={6}
                        columns={visibleColumns.length + 2}
                      />
                    </RequestDetailRow>
                  )}
                  {(requests.data?.data ?? []).map((row, index) => (
                      <Fragment key={row.id}>
                        <RequestRecordRow
                          className={`${requestRowClass} ${density === "compact" ? compactRequestRowClass : ""} ${expandedRow === row.id ? requestExpandedRowClass : ""} ${selectedIds.has(row.id) ? requestSelectedRowClass : ""} ${queue.alerts.some((alert) => alert.id === row.id) ? "request-alert-blink" : ""}`}
                          key={row.id}
                          style={
                            { "--row-index": index } as React.CSSProperties
                          }
                        >
                          <span className="flex items-center gap-2">
                            <RequestExpandButton
                              requestId={row.id}
                              expanded={expandedRow === row.id}
                              onToggle={() => {
                                setExpandedRow((current) =>
                                  current === row.id ? null : row.id,
                                );
                                queue.acknowledge(row.id);
                              }}
                            />
                            {row.status === "REQUESTED" && (
                              <input
                                type="checkbox"
                                className={requestCheckboxClass}
                                aria-label={`Select request ${row.id}`}
                                checked={selectedIds.has(row.id)}
                                onChange={() => toggleSelected(row.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            )}
                          </span>
                          {hasColumn("status") && (
                              <span className="flex items-center gap-2">
                              <StatusText status={row.display_status ?? row.status} />
                            </span>
                          )}
                          {hasColumn("runningTime") && (
                            <RequestElapsedTime request={row} />
                          )}
                          {hasColumn("requestTime") && (
                            <span>{formatDateTime(row.request_timestamp)}</span>
                          )}
                          {hasColumn("cluster") && (
                            <span title={row.cluster}>{row.cluster}</span>
                          )}
                          {hasColumn("region") && <span>{row.region}</span>}
                          {hasColumn("dock") && <span>{row.dock_no}</span>}
                          {hasColumn("backlogs") && (
                            <span>{row.backlogs.toLocaleString()}</span>
                          )}
                          {hasColumn("backlogsTime") && (
                            <span>
                              {formatDateTime(row.backlogs_timestamp)}
                            </span>
                          )}
                          {hasColumn("lhTypeRequest") && (
                            <span>{displayValue(row.truck_type)}</span>
                          )}
                          {hasColumn("opsFte") && (
                            <span>
                              {displayValue(row.ob_fte_name ?? row.ob_fte)}
                            </span>
                          )}
                          {hasColumn("plateNumber") && (
                            <span>{displayValue(row.plate_number)}</span>
                          )}
                          {hasColumn("mmFte") && (
                            <span>
                              {displayRequestActor(row.mm_fte_name, row.mm_fte_id)}
                            </span>
                          )}
                          {hasColumn("truckSize") && (
                            <span>{row.truck_size}</span>
                          )}
                          {hasColumn("lhTypeInput") && (
                            <span>{displayValue(row.truck_type)}</span>
                          )}
                          {hasColumn("provideTime") && (
                            <span>{formatDateTime(row.provide_time)}</span>
                          )}
                          {hasColumn("linehaulTrip") && (
                            <span>{displayValue(row.linehaul_trip_no)}</span>
                          )}
                          {hasColumn("assignedTime") && <span>{formatDateTime(row.driver_assigned_at)}</span>}
                          {hasColumn("dockedTime") && (
                            <span>{formatDateTime(row.docked_time)}</span>
                          )}
                          {hasColumn("docOfficer") && (
                            <span>
                              {displayRequestActor(row.doc_officer_name, row.doc_officer_id)}
                            </span>
                          )}
                          {hasColumn("opsPic") && (
                            <span>
                              {displayValue(row.ob_fte_name ?? row.ob_fte)}
                            </span>
                          )}
                          <LhRowActionMenu
                            open={openRow === row.id}
                            ariaLabel={`Actions for request ${row.id}`}
                            onToggle={() => {
                              modalTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                              setOpenRow(openRow === row.id ? null : row.id);
                            }}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPrintRequest(row);
                                setOpenRow(null);
                              }}
                            >
                              <Printer size={14} />
                              Print
                            </button>
                            {row.status === "REQUESTED" && (
                              <>
                                <button
                                  className={requestAssignClass}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelected({
                                      request: row,
                                      action: "assign-truck",
                                    });
                                    setOpenRow(null);
                                  }}
                                >
                                  Assign
                                </button>
                                <button
                                  className={requestRejectClass}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelected({
                                      request: row,
                                      action: "reject-mm",
                                    });
                                    setOpenRow(null);
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </LhRowActionMenu>
                        </RequestRecordRow>
                        {expandedRow === row.id && (
                          <RequestDetailRow columns={visibleColumns.length + 2}>
                            <RequestExpandedDetails
                              request={row}
                              visibleColumns={visibleColumns}
                            />
                          </RequestDetailRow>
                        )}
                      </Fragment>
                    ))}
                  {requests.data && requests.data.data.length === 0 && (
                      <RequestDetailRow columns={visibleColumns.length + 2}>
                      <div className="col-span-full grid min-h-[220px] place-items-center content-center gap-[6px] p-8 text-center text-xs text-soc5-muted bg-soc5-panel">
                        {emptyMessage}
                      </div>
                      </RequestDetailRow>
                    )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-0 content-start grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[10px] p-3 overflow-auto bg-linehaul-surface-soft">
              {requests.isPending ? (
                <SkeletonCardList rows={4} />
              ) : (
                (requests.data?.data ?? []).map((row) => (
                  <article
                    className={`flex min-w-0 min-h-[118px] justify-between gap-[14px] p-[14px] border border-soc5-line rounded-[8px] bg-soc5-panel shadow-[0_1px_2px_rgb(37_37_39/4%)] transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-soc5-line hover:shadow-[0_3px_10px_rgb(37_37_39/7%)] hover:transform-none max-[680px]:flex-wrap ${queue.alerts.some((alert) => alert.id === row.id) ? "request-alert-blink" : ""}`}
                    key={row.id}
                  >
                    <div>
                      <small className="text-soc5-muted text-xs">
                        {row.id}
                      </small>
                      <h3 className="mt-2 mb-1 text-soc5-ink text-sm font-semibold">
                        {row.cluster}
                      </h3>
                      <p className="m-0 text-soc5-muted text-xs">
                        {row.region} · Dock {row.dock_no}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 max-[760px]:items-start">
                      <strong className="text-soc5-ink text-xs">
                        {row.truck_size}
                      </strong>
                      <span>{row.backlogs.toLocaleString()} backlogs</span>
                      <StatusBadge status={row.display_status ?? row.status} uppercase />
                      <button
                        type="button"
                        className={textButtonClass}
                        onClick={(event) => { modalTrigger.current = event.currentTarget; queue.acknowledge(row.id); setPrintRequest(row); }}
                      >
                        <Printer size={14} />
                        Print label
                      </button>
                    </div>
                  </article>
                ))
              )}
              {requests.data && requests.data.data.length === 0 && (
                <p className="col-span-full p-8 text-center text-sm text-soc5-muted">{emptyMessage}</p>
              )}
            </div>
          )}
          <Pagination
            page={requests.data}
            perPage={filters.perPage}
            onPageChange={(page) =>
              setFilters((current) => ({ ...current, page }))
            }
            onPerPageChange={(perPage) =>
              setFilters((current) => ({ ...current, perPage, page: 1 }))
            }
          />
        </section>

        {selected && (
          <MidmileActionDialog
            returnFocus={modalTrigger.current}
            selection={selected}
            busy={transition.isPending}
            error={apiErrorMessage(transition.error)}
            onClose={() => setSelected(null)}
            onSubmit={(payload) => transition.mutate({ ...selected, payload })}
          />
        )}
      </section>
    </div>
  );
}
