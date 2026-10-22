import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clipboard,
  Clock3,
  Copy,
  Hash,
  Landmark,
  ListChecks,
  Truck,
  UserRound,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import {
  genericRequestDetailCardClass,
  genericRequestDetailGridClass,
  genericRequestDetailLabelClass,
  genericRequestDetailValueClass,
  genericRequestHeaderLabelClass,
  genericRequestSortButtonClass,
  genericRequestTableCellClass,
  genericRequestTableClass,
  genericRequestTableHeadCellClass,
  genericRequestTableRowClass,
  genericTableScrollClass,
  genericTableWrapClass,
} from "../lib/uiClasses";
import type { RequestSort, SortDirection, TruckRequest } from "../types";
import { NextActionText } from "./NextActionText";
import { displayRequestActor } from "./request/requestPresentation";
import { StatusText } from "./StatusBadge";
import { Skiper87 } from "./ui/skiper-ui/skiper87";

type Props = {
  rows: TruckRequest[];
  actions?: (request: TruckRequest) => ReactNode;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  sort?: RequestSort;
  direction?: SortDirection;
  onSort?: (sort: RequestSort) => void;
  visibleColumns?: string[];
  tableWrapperClassName?: string;
  emptyStateClassName?: string;
  alertedIds?: ReadonlySet<string>;
};

type Column = {
  key: string;
  sortKey?: RequestSort;
  label: string;
  icon: typeof Clock3;
  render: (request: TruckRequest) => ReactNode;
};

const columns: Column[] = [
  {
    key: "status",
    sortKey: "status",
    label: "Status",
    icon: Clock3,
    render: (request) => (
      <StatusText status={request.display_status ?? request.status} />
    ),
  },
  {
    key: "next_action",
    label: "Next action",
    icon: ListChecks,
    render: (request) => <NextActionText role={request.next_action_role} />,
  },
  {
    key: "running_time",
    label: "Running time",
    icon: Clock3,
    render: (request) => <RequestElapsedTime request={request} />,
  },
  {
    key: "request_timestamp",
    sortKey: "request_timestamp",
    label: "Request ts",
    icon: Clock3,
    render: (request) => formatDateTime(request.request_timestamp),
  },
  {
    key: "cluster",
    sortKey: "cluster",
    label: "Cluster",
    icon: Landmark,
    render: (request) => <ClusterCell request={request} />,
  },
  {
    key: "dock_no",
    sortKey: "dock_no",
    label: "Dock #",
    icon: Truck,
    render: (request) => request.dock_no,
  },
  {
    key: "backlogs",
    sortKey: "backlogs",
    label: "Backlogs",
    icon: ListChecks,
    render: (request) => request.backlogs.toLocaleString(),
  },
  {
    key: "ob_fte",
    label: "Ops FTE",
    icon: UserRound,
    render: (request) => empty(request.ob_fte_name ?? request.ob_fte),
  },
  {
    key: "linehaul_trip_no",
    label: "LHTrip #",
    icon: Clipboard,
    render: (request) => <TripCopyCell request={request} />,
  },
  {
    key: "plate_number",
    sortKey: "plate_number",
    label: "Plate #",
    icon: Hash,
    render: (request) => empty(request.plate_number),
  },
  {
    key: "mm_fte",
    label: "FTE MM",
    icon: UserRound,
    render: (request) =>
      displayRequestActor(request.mm_fte_name, request.mm_fte_id),
  },
  {
    key: "truck_size",
    label: "Truck Size",
    icon: Truck,
    render: (request) => empty(request.truck_size),
  },
  {
    key: "truck_type",
    label: "Truck Type",
    icon: Truck,
    render: (request) => empty(request.truck_type),
  },
  {
    key: "provide_time",
    label: "Provide TS",
    icon: Clock3,
    render: (request) => formatDateTime(request.provide_time),
  },
  {
    key: "docked_time",
    label: "Docked TS",
    icon: Clock3,
    render: (request) => formatDateTime(request.docked_time),
  },
  {
    key: "doc_officer",
    label: "DOC Officer",
    icon: UserRound,
    render: (request) =>
      displayRequestActor(request.doc_officer_name, request.doc_officer_id),
  },
];

export function RequestTable({
  rows,
  actions,
  emptyMessage = "No requests found.",
  emptyAction,
  sort,
  direction,
  onSort,
  visibleColumns,
  tableWrapperClassName = "",
  emptyStateClassName = "",
  alertedIds,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!rows.length)
    return (
      <div className={`empty-state ${emptyStateClassName}`.trim()}>
        <strong>No requests</strong>
        <p>{emptyMessage}</p>
        {emptyAction && (
          <div className="empty-state-actions">{emptyAction}</div>
        )}
      </div>
    );
  const visibleSet = visibleColumns ? new Set(visibleColumns) : null;
  const renderedColumns = visibleSet
    ? columns.filter((column) => visibleSet.has(column.key))
    : columns;

  function heading(column: Column) {
    const content = (
      <span className={genericRequestHeaderLabelClass}>
        <column.icon size={14} aria-hidden="true" />
        {column.label}
      </span>
    );
    if (!onSort || !column.sortKey) return content;
    const active = sort === column.sortKey;
    const Icon = active
      ? direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ChevronsUpDown;
    return (
      <button
        className={genericRequestSortButtonClass}
        type="button"
        onClick={() => onSort(column.sortKey!)}
      >
        {content}
        <Icon size={13} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className={`${genericTableWrapClass} ${tableWrapperClassName}`.trim()}>
      <Skiper87 className={genericTableScrollClass}>
        <table
          className={genericRequestTableClass}
          aria-label="Request records"
        >
          <thead>
            <tr>
              <th scope="col" className={genericRequestTableHeadCellClass}>
                <span className="sr-only">Expand</span>
              </th>
              {renderedColumns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    onSort && column.sortKey
                      ? sort === column.sortKey
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={`${genericRequestTableHeadCellClass} request-column request-column--${column.key}`}
                >
                  {heading(column)}
                </th>
              ))}
              {actions && (
                <th scope="col" className={genericRequestTableHeadCellClass}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((request) => {
              const expanded = expandedId === request.id;
              const detailId = `request-detail-${request.id}`;
              return (
                <Fragment key={request.id}>
                  <tr
                    className={`request-row ${genericRequestTableRowClass}${alertedIds?.has(request.id) ? " request-alert-blink" : ""}`}
                  >
                    <td
                      className={`${genericRequestTableCellClass} request-column request-column--expand`}
                      data-label="Expand"
                    >
                      <button
                        type="button"
                        className="inline-flex min-h-7 cursor-pointer items-center justify-center border-0 bg-transparent p-1 text-soc5-muted hover:text-soc5-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep"
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailId : undefined}
                        aria-label={`${expanded ? "Collapse" : "Expand"} request ${request.id}`}
                        onClick={() =>
                          setExpandedId((value) =>
                            value === request.id ? null : request.id,
                          )
                        }
                      >
                        <ChevronDown
                          size={15}
                          aria-hidden="true"
                          className={expanded ? "rotate-180" : undefined}
                        />
                      </button>
                    </td>
                    {renderedColumns.map((column) => (
                      <td
                        key={column.key}
                        className={`${genericRequestTableCellClass} request-column request-column--${column.key} max-w-[9rem] text-ellipsis whitespace-nowrap`}
                        title={cellValue(request, column)}
                        data-label={column.label}
                      >
                        {column.render(request)}
                      </td>
                    ))}
                    {actions && (
                      <td
                        className={`${genericRequestTableCellClass} request-column request-column--actions`}
                        data-label="Actions"
                      >
                        <div className="row-actions">{actions(request)}</div>
                      </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr className="request-detail-row" id={detailId}>
                      <td
                        className="w-full max-w-0 overflow-hidden p-0"
                        colSpan={renderedColumns.length + (actions ? 2 : 1)}
                      >
                        <RequestDetails request={request} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Skiper87>
    </div>
  );
}

export function formatElapsed(
  start: string | null | undefined,
  end: string | null | undefined,
  now = new Date(),
) {
  if (!start) return "-";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : now.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "-";
  const minutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${remainder}m`;
  return `${remainder}m`;
}

export function RequestElapsedTime({ request }: { request: TruckRequest }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (request.driver_assigned_at) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [request.driver_assigned_at]);
  return (
    <span title="Request to Driver ID assignment">
      {formatElapsed(
        request.request_timestamp,
        request.driver_assigned_at,
        now,
      )}
    </span>
  );
}

function empty(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function cellValue(request: TruckRequest, column: Column) {
  if (column.key === "cluster") return request.cluster;
  if (column.key === "linehaul_trip_no")
    return request.linehaul_trip_no ?? undefined;
  const value = column.render(request);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function ClusterCell({ request }: { request: TruckRequest }) {
  const value = empty(request.cluster);
  const label = value === "-" ? "-" : `SOC 5 > ${value}`;

  return (
    <div className="cluster-cell" title={value === "-" ? undefined : value}>
      <span className="cluster-cell-value">{label}</span>
    </div>
  );
}

function TripCopyCell({ request }: { request: TruckRequest }) {
  const [copied, setCopied] = useState(false);
  const value = empty(request.linehaul_trip_no);

  if (value === "-") {
    return <span className="trip-value">-</span>;
  }

  return (
    <div className="trip-cell">
      <button
        type="button"
        className={`inline-icon-button ${copied ? "is-copied" : ""}`}
        onClick={async (event) => {
          event.stopPropagation();
          if (!request.linehaul_trip_no) return;
          try {
            await navigator.clipboard.writeText(request.linehaul_trip_no);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          } catch (error) {
            console.error("Unable to copy trip number", error);
          }
        }}
        aria-label="Copy linehaul trip number"
        title="Copy linehaul trip number"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <span className="trip-value">{value}</span>
    </div>
  );
}

function RequestDetails({ request }: { request: TruckRequest }) {
  const fields: Array<[string, ReactNode]> = [
    ...columns
      .filter(({ key }) => key !== "running_time")
      .map((column): [string, ReactNode] => [
        column.label,
        column.render(request),
      ]),
    ["Assigned time", formatDateTime(request.driver_assigned_at)],
    ["Created By", request.created_by_name ?? request.created_by],
    ["Created At", formatDateTime(request.created_at)],
    ["Updated At", formatDateTime(request.updated_at)],
    ["Driver", empty(request.driver_id)],
    ["Rejection Remarks", empty(request.rejection_remarks)],
    ["Cancellation Remarks", empty(request.cancellation_remarks)],
  ];

  return (
    <div className={genericRequestDetailGridClass}>
      {fields.map(([label, value]) => (
        <div className={genericRequestDetailCardClass} key={label}>
          <span className={genericRequestDetailLabelClass}>{label}</span>
          <strong className={genericRequestDetailValueClass}>{value}</strong>
        </div>
      ))}
    </div>
  );
}
