import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CircleCheck,
  Clock3,
  Download,
  Hash,
  ListChecks,
  Printer,
  Truck,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";
import {
  linehaulColumnOptions,
  linehaulPrimaryColumnKeysForRole,
} from "../components/ColumnVisibilityMenu";
import { LhRowActionMenu } from "../components/LhRowActionMenu";
import { statuses } from "../components/RequestFilters";
import { Pagination } from "../components/Pagination";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { RequestElapsedTime } from "../components/RequestTable";
import { MidmileActionDialog } from "../components/request/MidmileActionDialog";
import { RequestExpandButton } from "../components/request/RequestExpandButton";
import { RequestExpandedDetails } from "../components/request/RequestExpandedDetails";
import { RequestFetchNotice } from "../components/request/RequestFetchNotice";
import {
  RequestDetailRow,
  RequestRecordHead,
  RequestRecordRow,
} from "../components/request/RequestRecordTable";
import {
  displayRequestActor,
  displayRequestValue as displayValue,
  formatRequestDateTime as formatDateTime,
  formatRequestDetailDateTime as formatDetailDateTime,
} from "../components/request/requestPresentation";
import { SkeletonCardList, SkeletonRequestTable } from "../components/Skeleton";
import { StatusBadge, StatusText } from "../components/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useLinehaulTablePreferences } from "../hooks/useLinehaulTablePreferences";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import { useRequestFilters } from "../hooks/useRequestFilters";
import { api, apiErrorMessage } from "../lib/api";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import { requestQueryKey } from "../lib/requestRefresh";
import { openRequestsSheet, requestQueryString } from "../lib/requests";
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
  requestWorkspaceClass,
  tableShellClass,
  textButtonClass,
} from "../lib/uiClasses";
import { type WorkflowAction, workflowActionPath } from "../lib/workflow";
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

export function MidmileRequests({
  user,
  queue,
}: {
  user: User;
  queue: QueueSnapshot;
}) {
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
  const view = "table" as const;
  const [printRequest, setPrintRequest] = useState<TruckRequest | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const { visibleColumns, density } =
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
  const statusTabs = statuses.map((status) => ({
    status,
    count:
      status === "ALL"
        ? (requests.data?.data ?? []).length
        : (requests.data?.data ?? []).filter((row) => row.status === status)
            .length,
  }));
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
  const emptyMessage =
    requests.isFetching || requests.error || requests.isPlaceholderData
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
          <div className="relative z-20 flex min-w-0 flex-wrap items-center gap-3 border-b border-soc5-line bg-linehaul-surface-soft px-3 py-2 max-[680px]:items-stretch max-[680px]:gap-2 max-[680px]:p-2">
            <Tabs
              value={filters.status}
              onValueChange={(value) =>
                changeFilters({
                  ...filters,
                  status: value as (typeof filters)["status"],
                  page: 1,
                })
              }
              className="min-w-0 flex-1"
            >
              <TabsList
                className="h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-full bg-soc5-panel p-1 [scrollbar-width:thin]"
                aria-label="Request status tabs"
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
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-soc5-ink bg-soc5-ink px-4 py-1.5 text-sm font-medium text-soc5-panel transition-colors hover:bg-soc5-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linehaul-teal/40 disabled:cursor-wait disabled:opacity-60 max-[680px]:flex-1"
              type="button"
              disabled={exporting}
              onClick={exportSheet}
            >
              <Download size={16} aria-hidden="true" />
              {exporting ? "Exporting" : "Export"}
            </button>
          </div>
          <RequestFetchNotice
            hasData={requests.data !== undefined}
            fetching={requests.isFetching}
            previousFilters={requests.isPlaceholderData}
            error={requests.error}
            onRetry={() => void requests.refetch()}
          />
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
                        style={{ "--row-index": index } as React.CSSProperties}
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
                            <StatusText
                              status={row.display_status ?? row.status}
                            />
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
                          <span>{formatDateTime(row.backlogs_timestamp)}</span>
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
                            {displayRequestActor(
                              row.mm_fte_name,
                              row.mm_fte_id,
                            )}
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
                        {hasColumn("assignedTime") && (
                          <span>{formatDateTime(row.driver_assigned_at)}</span>
                        )}
                        {hasColumn("dockedTime") && (
                          <span>{formatDateTime(row.docked_time)}</span>
                        )}
                        {hasColumn("docOfficer") && (
                          <span>
                            {displayRequestActor(
                              row.doc_officer_name,
                              row.doc_officer_id,
                            )}
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
                            modalTrigger.current =
                              document.activeElement instanceof HTMLElement
                                ? document.activeElement
                                : null;
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
                        <RequestDetailRow
                          id={`request-detail-${row.id}`}
                          columns={visibleColumns.length + 2}
                        >
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
                      <StatusBadge
                        status={row.display_status ?? row.status}
                        uppercase
                      />
                      <button
                        type="button"
                        className={textButtonClass}
                        onClick={(event) => {
                          modalTrigger.current = event.currentTarget;
                          queue.acknowledge(row.id);
                          setPrintRequest(row);
                        }}
                      >
                        <Printer size={14} />
                        Print label
                      </button>
                    </div>
                  </article>
                ))
              )}
              {requests.data && requests.data.data.length === 0 && (
                <p className="col-span-full p-8 text-center text-sm text-soc5-muted">
                  {emptyMessage}
                </p>
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
