import { RequestFetchNotice } from "../components/request/RequestFetchNotice";
import {
  BadgeCheck,
  CircleCheck,
  Clock3,
  Hash,
  LayoutGrid,
  ListChecks,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  Truck,
} from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { textButtonClass } from "../lib/uiClasses";
import {
  compactRequestRowClass,
  inlineCreateShellClass,
  recordsScrollClass,
  recordsTableClass,
  requestApproveClass,
  requestCheckboxClass,
  requestExpandedRowClass,
  requestPageClass,
  requestRejectClass,
  requestRowClass,
  requestSelectedRowClass,
  requestTableBodyClass,
  requestTableHeadClass,
  requestToolbarIconClass,
  requestViewToggleClass,
  requestWorkspaceClass,
  tableShellClass,
} from "../lib/uiClasses";
import {
  ApprovalStateBadge,
  approvalStateFor,
} from "../components/approval/ApprovalStateBadge";
import {
  linehaulColumnOptions,
  linehaulPrimaryColumnKeys,
} from "../components/ColumnVisibilityMenu";
import { LhRowActionMenu } from "../components/LhRowActionMenu";
import { LhTableToolbar } from "../components/LhTableToolbar";
import {
  OutboundRejectDialog,
  OutboundRequestDrawer,
} from "../components/request/OutboundRequestOverlays";
import { Pagination } from "../components/Pagination";
import { PrintableTruckLabel } from "../components/PrintableTruckLabel";
import { SkeletonCardList, SkeletonRequestTable } from "../components/Skeleton";
import { StatusBadge, StatusText } from "../components/StatusBadge";
import { RequestElapsedTime } from "../components/RequestTable";
import { RequestExpandButton } from "../components/request/RequestExpandButton";
import {
  displayRequestValue as displayValue,
  formatRequestDateTime as formatDateTime,
  formatRequestDetailDateTime as formatDetailDateTime,
} from "../components/request/requestPresentation";
import { useLinehaulTablePreferences } from "../hooks/useLinehaulTablePreferences";
import { useOutboundRequests } from "../hooks/useOutboundRequests";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import { openRequestsSheet } from "../lib/requests";
import type { TruckRequest, User } from "../types";

const InlineCreateRow = lazy(() =>
  import("../components/OutboundRequestForms").then(({ InlineCreateRow }) => ({
    default: InlineCreateRow,
  })),
);
const InlineEditRow = lazy(() =>
  import("../components/OutboundRequestForms").then(({ InlineEditRow }) => ({
    default: InlineEditRow,
  })),
);

function formatCluster(value: string) {
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

function expandedRequestGroups(
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
        { key: "assignedTime", label: "Assigned Time", value: "-" },
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
          value: displayValue(row.created_by_name ?? row.created_by),
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
          value: displayValue(row.created_by_name ?? row.created_by),
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

export function OutboundRequests({
  user: _user,
  queue: _queue,
}: {
  user: User;
  queue: QueueSnapshot;
}) {
  const {
    filters,
    setFilters,
    changeFilters,
    requests,
    rows,
    creating,
    setCreating,
    editing,
    setEditing,
    toast,
    showToast,
    createRequest,
    updateRequest,
    approveRequests,
    rejectRequest,
    sortBy,
    refreshManually,
    lastRefreshReason,
    dataUpdatedAt,
  } = useOutboundRequests();
  const [view, setView] = useState<"table" | "card">("table");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [printRequest, setPrintRequest] = useState<TruckRequest | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<TruckRequest | null>(
    null,
  );
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const printTrigger = useRef<HTMLElement | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [rejecting, setRejecting] = useState<TruckRequest | null>(null);
  const [exporting, setExporting] = useState(false);
  const { visibleColumns, updateColumns, density, setDensity } =
    useLinehaulTablePreferences(
      "outbound",
      linehaulColumnOptions.map(({ key }) => key),
      linehaulPrimaryColumnKeys,
    );
  const hasColumn = (key: string) =>
    (visibleColumns as readonly string[]).includes(key);
  function exportRows() {
    if (exporting) return;
    setExporting(true);
    openRequestsSheet();
    window.setTimeout(() => setExporting(false), 700);
  }
  const canApprove = _user.role === "fte_ops";
  const canEdit = _user.role === "fte_ops";
  const selectedCount = selectedIds.size;
  const approvalLabel = selectedCount > 2 ? "Bulk Approved" : "Approved";
  const canActOnApproval = (row: TruckRequest) =>
    canApprove &&
    (row.status === "PENDING" || row.status === "REROUTED") &&
    approvalStateFor(row.status, row.approval_status) === "pending";

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(row: TruckRequest) {
    setExpandedRow((current) => (current === row.id ? null : row.id));
    _queue.acknowledge(row.id);
  }

  function approveSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    approveRequests.mutate(ids, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }

  const emptyMessage = requests.isFetching || requests.error || requests.isPlaceholderData
    ? "No requests in the last successful results."
    : "No live requests match the current filters.";

  return (
    <div className={requestPageClass}>
      <section className={requestWorkspaceClass} aria-label="Linehaul requests">
        {editing && (
          <div className={inlineCreateShellClass}>
            <Suspense fallback={null}>
              <InlineEditRow
                request={editing}
                busy={updateRequest.isPending}
                error={updateRequest.error?.message}
                onCancel={() => {
                  updateRequest.reset();
                  setEditing(null);
                }}
                onSubmit={(payload) =>
                  updateRequest.mutate({ id: editing.id, payload })
                }
              />
            </Suspense>
          </div>
        )}
        {creating && (
          <div className={inlineCreateShellClass}>
            <Suspense fallback={null}>
              <InlineCreateRow
                busy={createRequest.isPending}
                error={createRequest.error?.message}
                onCancel={() => {
                  createRequest.reset();
                  setCreating(false);
                }}
                onSubmit={(payload) => createRequest.mutate(payload)}
              />
            </Suspense>
          </div>
        )}
        {printRequest && (
          <PrintableTruckLabel
            request={printRequest}
            returnFocus={printTrigger.current}
            onClose={() => setPrintRequest(null)}
          />
        )}
        <section
          className={tableShellClass}
          aria-label="Outbound linehaul request records"
        >
          <div className="relative z-20 flex min-w-0 flex-wrap items-center justify-start gap-2 border-b border-soc5-line bg-linehaul-surface-soft px-2.5 py-1.5 max-[680px]:flex-col max-[680px]:items-stretch max-[680px]:gap-1.5 max-[680px]:p-[.45rem]">
            <LhTableToolbar
              filters={filters}
              onChange={changeFilters}
              onSort={sortBy}
              onExport={exportRows}
              onAddNew={() => {
                createRequest.reset();
                setCreating(true);
              }}
              onNotice={showToast}
              showCreateNew={_user.role === "ops_pic" || canApprove}
              visibleColumns={visibleColumns}
              onColumnsChange={updateColumns}
              density={density}
              onDensityChange={setDensity}
              exporting={exporting}
              lastUpdated={dataUpdatedAt}
              refreshReason={lastRefreshReason}
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
                onClick={refreshManually}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <fieldset
                className={requestViewToggleClass}
                style={{ border: 0, margin: 0, padding: 0 }}
                aria-label="Request view"
              >
                <button
                  className={requestToolbarIconClass}
                  type="button"
                  aria-label="Table"
                  title="Table"
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                >
                  <Table2 size={16} aria-hidden="true" />
                </button>
                <button
                  className={requestToolbarIconClass}
                  type="button"
                  aria-label="Card"
                  title="Card"
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
              onRetry={refreshManually}
            />
          </div>
          {view === "table" ? (
            <div className={recordsScrollClass}>
              <div
                className={recordsTableClass}
                style={{
                  gridTemplateColumns: hasColumn("status")
                    ? `minmax(10rem, max-content) repeat(${visibleColumns.length}, minmax(112px, max-content))`
                    : `repeat(${visibleColumns.length + 1}, minmax(112px, max-content))`,
                }}
              >
                <div className={requestTableHeadClass}>
                  {hasColumn("status") && (
                    <span>
                      <CircleCheck size={14} />
                      Status
                    </span>
                  )}
                  {hasColumn("runningTime") && (
                    <span>
                      <Clock3 size={14} />
                      Running time
                    </span>
                  )}
                  {hasColumn("requestTime") && (
                    <button
                      type="button"
                      onClick={() => sortBy("request_timestamp")}
                    >
                      <Clock3 size={14} />
                      <span>Request Time</span>
                      <SlidersHorizontal size={13} />
                    </button>
                  )}
                  {hasColumn("cluster") && (
                    <button type="button" onClick={() => sortBy("cluster")}>
                      <Hash size={14} />
                      <span>Cluster</span>
                      <SlidersHorizontal size={13} />
                    </button>
                  )}
                  {hasColumn("region") && (
                    <span>
                      <BadgeCheck size={14} />
                      Region
                    </span>
                  )}
                  {hasColumn("dock") && (
                    <button type="button" onClick={() => sortBy("dock_no")}>
                      <Truck size={14} />
                      <span>Dock #</span>
                      <SlidersHorizontal size={13} />
                    </button>
                  )}
                  {hasColumn("backlogs") && (
                    <button type="button" onClick={() => sortBy("backlogs")}>
                      <ListChecks size={14} />
                      <span>Backlogs</span>
                      <SlidersHorizontal size={13} />
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
                      onClick={() => sortBy("plate_number")}
                    >
                      <Hash size={14} />
                      <span>Plate number</span>
                      <SlidersHorizontal size={13} />
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
                  <span className="justify-center">
                    {canApprove && selectedCount > 0 && (
                      <button
                        type="button"
                        className={`${requestApproveClass} h-8! whitespace-nowrap px-3!`}
                        disabled={approveRequests.isPending}
                        onClick={approveSelected}
                      >
                        {approvalLabel}
                      </button>
                    )}
                  </span>
                </div>
                <div className={requestTableBodyClass}>
                  {requests.isPending && (
                    <SkeletonRequestTable
                      rows={6}
                      columns={visibleColumns.length + 1}
                    />
                  )}
                  {rows.map((row, index) => {
                      const isExpanded = expandedRow === row.id;
                      const isAlerting =
                        (row.status === "PENDING" ||
                          row.status === "REROUTED") &&
                        _queue.alerts.some((alert) => alert.id === row.id);
                      return (
                        <div className="contents" key={row.id}>
                          <div
                            className={`${requestRowClass} ${density === "compact" ? compactRequestRowClass : ""} ${isExpanded ? requestExpandedRowClass : ""} ${selectedIds.has(row.id) ? requestSelectedRowClass : ""} ${isAlerting ? "bg-linehaul-surface-soft! ring-1 ring-inset ring-[#a2c500] motion-safe:animate-pulse" : ""}`}
                            style={
                              { "--row-index": index } as React.CSSProperties
                            }
                          >
                            {hasColumn("status") && (
                              <span className="flex min-w-max items-center gap-2 overflow-visible whitespace-nowrap">
                                <RequestExpandButton
                                  requestId={row.id}
                                  expanded={isExpanded}
                                  onToggle={() => toggleExpanded(row)}
                                />
                                {canApprove &&
                                  (row.status === "PENDING" ||
                                    row.status === "REROUTED") && (
                                    <input
                                      type="checkbox"
                                      className={requestCheckboxClass}
                                      aria-label={`Select request ${row.id}`}
                                      checked={
                                        row.approval_status === "APPROVED" ||
                                        selectedIds.has(row.id)
                                      }
                                      disabled={
                                        approvalStateFor(
                                          row.status,
                                          row.approval_status,
                                        ) !== "pending" ||
                                        approveRequests.isPending
                                      }
                                      onChange={() => toggleSelected(row.id)}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                )}
                                <StatusText status={row.status} />
                                <ApprovalStateBadge
                                  status={row.status}
                                  approvalStatus={row.approval_status}
                                />
                              </span>
                            )}
                            {hasColumn("runningTime") && (
                              <RequestElapsedTime request={row} />
                            )}
                            {hasColumn("requestTime") && (
                              <span>
                                {formatDateTime(row.request_timestamp)}
                              </span>
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
                                {displayValue(
                                  row.created_by_name ?? row.created_by,
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
                            {hasColumn("assignedTime") && <span>-</span>}
                            {hasColumn("dockedTime") && (
                              <span>{formatDateTime(row.docked_time)}</span>
                            )}
                            {hasColumn("docOfficer") && (
                              <span>
                                {displayValue(
                                  row.created_by_name ?? row.created_by,
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
                                drawerTrigger.current = document.activeElement instanceof HTMLElement
                                  ? document.activeElement : null;
                                setOpenRow(openRow === row.id ? null : row.id);
                              }}
                            >
                              <button
                                role="menuitem"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedRequest(row);
                                  setOpenRow(null);
                                }}
                              >
                                View
                              </button>
                              <button
                                role="menuitem"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  printTrigger.current = drawerTrigger.current;
                                  setPrintRequest(row);
                                  setOpenRow(null);
                                }}
                              >
                                <Printer size={14} />
                                Print
                              </button>
                              {canActOnApproval(row) && (
                                <button
                                  role="menuitem"
                                  className={requestRejectClass}
                                  type="button"
                                  onClick={() => {
                                    setRejecting(row);
                                    setOpenRow(null);
                                  }}
                                >
                                  Reject
                                </button>
                              )}
                              {canEdit && canActOnApproval(row) && (
                                <button
                                  role="menuitem"
                                  type="button"
                                  onClick={() => {
                                    updateRequest.reset();
                                    setEditing(row);
                                    setOpenRow(null);
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                            </LhRowActionMenu>
                          </div>
                          {isExpanded && (
                            <section
                              className="col-span-full min-w-0 w-full max-w-full overflow-x-hidden border-b border-soc5-line border-l-2 border-l-[#a2c500] bg-linehaul-surface-soft px-5 py-3 text-xs text-soc5-ink"
                              aria-label={`Expanded details for request ${row.id}`}
                            >
                              <div className="grid w-full min-w-0 max-w-full gap-3 overflow-x-hidden">
                                <dl>
                                  <div className="border-b border-soc5-line pb-3">
                                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-soc5-muted">
                                      Cluster
                                    </dt>
                                    <dd className="wrap-break-word text-base font-semibold leading-6 tracking-normal text-soc5-ink">
                                      {formatCluster(row.cluster)}
                                    </dd>
                                  </div>
                                </dl>
                                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(13rem,100%),1fr))] gap-3 overflow-x-hidden pt-3">
                                  {expandedRequestGroups(
                                    row,
                                    visibleColumns,
                                  ).map(({ fields }) => (
                                    <section
                                      className="min-w-0"
                                      key={fields[0]?.key}
                                    >
                                      <dl className="grid gap-2">
                                        {fields.map(({ key, label, value }) => (
                                          <div
                                            className="min-w-0 border-b border-soc5-line pb-2"
                                            key={key}
                                          >
                                            <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-soc5-muted">
                                              {label}
                                            </dt>
                                            <dd className="wrap-break-word text-xs font-medium leading-4 text-soc5-ink">
                                              {value}
                                            </dd>
                                          </div>
                                        ))}
                                      </dl>
                                    </section>
                                  ))}
                                </div>
                              </div>
                            </section>
                          )}
                        </div>
                      );
                    })}
                  {requests.data && rows.length === 0 && (
                      <div className="col-span-full grid min-h-[220px] place-items-center content-center gap-[6px] p-8 text-center text-xs text-soc5-muted bg-soc5-panel">
                        {emptyMessage}
                      </div>
                    )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 content-start grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[10px] p-3 overflow-auto bg-linehaul-surface-soft">
              {requests.isPending ? (
                <SkeletonCardList rows={4} />
              ) : (
                rows.map((row) => (
                  <article
                    className="lh-record-card flex min-w-0 min-h-[118px] justify-between gap-[14px] p-[14px] border border-soc5-line rounded-[8px] bg-soc5-panel shadow-[0_1px_2px_rgb(37_37_39/4%)] transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-soc5-line hover:shadow-[0_3px_10px_rgb(37_37_39/7%)] hover:transform-none max-[680px]:flex-wrap"
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
                      <StatusBadge status={row.status} uppercase />
                      <button
                        type="button"
                        className={textButtonClass}
                        aria-label="View details"
                        onClick={(event) => {
                          drawerTrigger.current = event.currentTarget;
                          setSelectedRequest(row);
                        }}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        className={textButtonClass}
                        onClick={(event) => { printTrigger.current = event.currentTarget; setPrintRequest(row); }}
                      >
                        <Printer size={14} />
                        Print label
                      </button>
                    </div>
                  </article>
                ))
              )}
              {requests.data && rows.length === 0 && (
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
      </section>
      {selectedRequest && (
        <OutboundRequestDrawer
          request={selectedRequest}
          returnFocus={drawerTrigger.current}
          onClose={() => setSelectedRequest(null)}
        />
      )}
      {rejecting && (
        <OutboundRejectDialog
          returnFocus={drawerTrigger.current}
          request={rejecting}
          busy={rejectRequest.isPending}
          error={rejectRequest.error?.message}
          onClose={() => setRejecting(null)}
          onSubmit={(remarks) =>
            rejectRequest.mutate(
              { id: rejecting.id, rejection_remarks: remarks },
              { onSuccess: () => setRejecting(null) },
            )
          }
        />
      )}
      {toast && (
        <div
          className="fixed right-5 bottom-5 z-30 max-w-[min(420px,calc(100vw-32px))] rounded-[7px] border border-soc5-line bg-linehaul-surface-soft px-[14px] py-[11px] text-xs text-soc5-ink shadow-[0_8px_24px_rgb(32_32_34/14%)]"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
