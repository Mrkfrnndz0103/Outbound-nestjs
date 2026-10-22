import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { TruckRequest, User } from "../types";
import { useOutboundRequests } from "../hooks/useOutboundRequests";
import { MidmileActionDialog } from "../components/request/MidmileActionDialog";
import { DockDialog } from "../components/request/DockDialog";
import { api } from "../lib/api";
import { workflowActionPath } from "../lib/workflow";
import type { WorkflowAction } from "../lib/workflow";

// SLA thresholds are intentionally configurable in one place.
const SLA_GREEN_HOURS = 4;
const SLA_AMBER_HOURS = 24;
type Status =
  | "Pending"
  | "Approved"
  | "Requested"
  | "Rerouted"
  | "Assigned"
  | "Docking"
  | "Docked"
  | "Rejected"
  | "Cancelled";
const STATUSES: Status[] = [
  "Pending",
  "Approved",
  "Requested",
  "Rerouted",
  "Assigned",
  "Docking",
  "Docked",
  "Rejected",
  "Cancelled",
];
const STATUS_ACTIONS: Partial<
  Record<
    Status,
    {
      label: string;
      next: Status;
      apiAction: WorkflowAction;
      danger?: boolean;
    }[]
  >
> = {
  Requested: [
    { label: "Assign truck", next: "Assigned", apiAction: "assign-truck" },
  ],
  Pending: [
    { label: "Approve", next: "Approved", apiAction: "approve" },
    {
      label: "Reject",
      next: "Rejected",
      apiAction: "reject-ops",
      danger: true,
    },
  ],
  Docking: [{ label: "Mark docked", next: "Docked", apiAction: "mark-docked" }],
};
// UI access follows the same role boundaries as the workflow API.
const ACTION_ROLES: Partial<Record<Status, User["role"][]>> = {
  Pending: ["fte_ops"],
  Requested: ["fte_mm"],
  Docking: ["doc_officer", "ops_pic"],
};
function actionsFor(status: Status, role: User["role"]) {
  return ACTION_ROLES[status]?.includes(role)
    ? (STATUS_ACTIONS[status] ?? [])
    : [];
}
const COLS = [
  "runningTime",
  "requestTime",
  "cluster",
  "region",
  "dock",
  "backlogs",
  "plateNumber",
  "lhSize",
  "linehaulTrip",
] as const;
type Col = (typeof COLS)[number];
const LABELS: Record<Col, string> = {
  runningTime: "Running time",
  requestTime: "Request time",
  cluster: "Cluster",
  region: "Region",
  dock: "Dock",
  backlogs: "Backlogs",
  plateNumber: "Plate number",
  lhSize: "LH size",
  linehaulTrip: "Linehaul trip",
};
const DOT: Record<Status, string> = {
  Pending: "bg-[#f0a11a]",
  Approved: "bg-[#2d8a62]",
  Requested: "bg-[#2e80b9]",
  Rerouted: "bg-[#8b63c7]",
  Assigned: "bg-[#3375d6]",
  Docking: "bg-[#d47a22]",
  Docked: "bg-[#24765a]",
  Rejected: "bg-[#c45454]",
  Cancelled: "bg-[#8b9298]",
};
const TONE: Record<Status, string> = {
  Pending: "bg-[#fff7e7] text-[#9a640b]",
  Approved: "bg-[#edf8f1] text-[#28724f]",
  Requested: "bg-[#edf6fb] text-[#2e6d98]",
  Rerouted: "bg-[#f4effb] text-[#7655a8]",
  Assigned: "bg-[#edf3ff] text-[#3568b3]",
  Docking: "bg-[#fff2e6] text-[#a65b18]",
  Docked: "bg-[#edf8f1] text-[#28724f]",
  Rejected: "bg-[#fff0f0] text-[#a44a4a]",
  Cancelled: "bg-[#f1f2f3] text-[#6e767c]",
};
const labelStatus = (status: TruckRequest["status"]): Status =>
  (
    ({
      PENDING: "Pending",
      REQUESTED: "Requested",
      CANCELLED: "Cancelled",
      REJECTED: "Rejected",
      REROUTED: "Rerouted",
      ASSIGNED: "Assigned",
      DOCKING: "Docking",
      DOCKED: "Docked",
    }) as Record<TruckRequest["status"], Status>
  )[status] ?? "Requested";
const hoursSince = (value?: string) =>
  value ? Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000) : 0;
const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-SG", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "-";
const formatHours = (hours: number) =>
  hours < 1
    ? `${Math.round(hours * 60)}m`
    : `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;

export function OutboundRequests({
  user: _user,
  queue: _queue,
}: {
  user: User;
  queue: unknown;
}) {
  const {
    rows: sourceRows,
    requests,
    approveRequests,
    rejectRequest,
    refreshManually,
  } = useOutboundRequests();
  const [tab, setTab] = useState<Status | "All">("All");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    region: "All",
    cluster: "All",
    dock: "All",
    lhSize: "All",
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<{
    request: TruckRequest;
    action: "assign-truck";
  } | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | undefined>();
  const [docking, setDocking] = useState<TruckRequest | null>(null);
  const [dockingBusy, setDockingBusy] = useState(false);
  const [visible, setVisible] = useState<Col[]>(
    COLS.filter((key) => key !== "linehaulTrip"),
  );
  const [sort, setSort] = useState<{
    key: Col | "default";
    direction: "asc" | "desc";
  }>({ key: "default", direction: "desc" });
  const rows = useMemo(
    () =>
      sourceRows.map((row) => ({
        ...row,
        displayStatus:
          row.status === "PENDING" && row.approval_status === "APPROVED"
            ? "Approved"
            : labelStatus(row.status),
        runningTime: hoursSince(row.request_timestamp ?? row.created_at),
        requestTime: row.request_timestamp ?? row.created_at,
        dock: row.dock_no,
        plateNumber: row.plate_number,
        lhSize: row.truck_size,
        linehaulTrip: row.linehaul_trip_no,
      })),
    [sourceRows],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUSES.map((status) => [
          status,
          rows.filter((row) => row.displayStatus === status).length,
        ]),
      ) as Record<Status, number>,
    [rows],
  );
  const maxBacklog = Math.max(1, ...rows.map((row) => row.backlogs));
  const options = useMemo(
    () => ({
      region: ["All", ...new Set(rows.map((row) => row.region))],
      cluster: ["All", ...new Set(rows.map((row) => row.cluster))],
      dock: ["All", ...new Set(rows.map((row) => row.dock))],
      lhSize: ["All", ...new Set(rows.map((row) => row.lhSize))],
    }),
    [rows],
  );
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (tab === "All" || row.displayStatus === tab) &&
        (!query ||
          `${row.cluster} ${row.dock} ${row.plateNumber ?? ""}`
            .toLowerCase()
            .includes(query)) &&
        Object.entries(filters).every(
          ([key, value]) =>
            value === "All" || row[key as keyof typeof row] === value,
        ),
    );
    return filtered.sort((a, b) => {
      if (sort.key === "default")
        return a.displayStatus === "Pending" && b.displayStatus !== "Pending"
          ? -1
          : b.displayStatus === "Pending" && a.displayStatus !== "Pending"
            ? 1
            : b.runningTime - a.runningTime;
      const av = a[sort.key];
      const bv = b[sort.key];
      return (
        String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
          numeric: true,
        }) * (sort.direction === "asc" ? 1 : -1)
      );
    });
  }, [rows, tab, search, filters, sort]);
  const primary: (Status | "All")[] = ["All", "Pending", "Approved", "Docking"];
  const moreTabs = STATUSES.filter((status) => !primary.includes(status));
  const overSla = rows.filter(
    (row) =>
      row.displayStatus === "Pending" && row.runningTime > SLA_AMBER_HOURS,
  ).length;
  const action = async (
    row: (typeof rows)[number],
    next: Status,
    apiAction: WorkflowAction,
  ) => {
    if (
      !actionsFor(row.displayStatus, _user.role).some(
        (item) => item.apiAction === apiAction && item.next === next,
      )
    ) {
      return;
    }
    if (apiAction === "approve") {
      approveRequests.mutate({
        ids: [row.id],
        operationId: `${row.id}-approve-${Date.now()}`,
      });
      return;
    }
    if (apiAction === "assign-truck") {
      const request = sourceRows.find((item) => item.id === row.id);
      if (!request) return;
      setAssignmentError(undefined);
      setAssignment({ request, action: "assign-truck" });
      return;
    }
    if (apiAction === "mark-docked") {
      const request = sourceRows.find((item) => item.id === row.id);
      if (!request) return;
      setDocking(request);
      return;
    }
    if (apiAction === "reject-ops") {
      rejectRequest.mutate({
        id: row.id,
        rejection_remarks: "Rejected from LH Request control tower",
      });
      return;
    }
    try {
      await api(workflowActionPath(row.id, apiAction), {
        method: "POST",
        body: JSON.stringify({}),
      });
      refreshManually();
    } catch {
      /* The shared request notice surfaces the next refresh error. */
    }
  };
  const clearFilters = () => {
    setFilters({ region: "All", cluster: "All", dock: "All", lhSize: "All" });
    setSearch("");
  };
  return (
    <main className="min-h-full bg-[#f5f6f6] px-4 py-5 text-[#242628] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <section className="mb-4 rounded-xl border border-[#e1e4e5] bg-white p-4">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Request status"
          >
            {primary.map((status) => (
              <button
                key={status}
                role="tab"
                aria-selected={tab === status}
                onClick={() => setTab(status)}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold ${tab === status ? "bg-[#242628] text-white" : status !== "All" && counts[status] === 0 ? "text-[#b4bbbe] hover:bg-[#f6f7f7]" : "text-[#687278] hover:bg-[#f1f3f3]"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${status === "All" ? "bg-[#8c9599]" : DOT[status]}`}
                />
                {status}
                <span className="rounded bg-[#f0f2f2] px-1.5 py-0.5 text-[10px]">
                  {status === "All" ? rows.length : counts[status]}
                </span>
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-[#687278] hover:bg-[#f1f3f3]"
              >
                More{" "}
                <span className="rounded bg-[#f0f2f2] px-1.5 py-0.5 text-[10px]">
                  {moreTabs.reduce(
                    (total, status) => total + counts[status],
                    0,
                  )}
                </span>
                <ChevronDown size={13} />
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-10 z-30 w-44 rounded-lg border border-[#e1e4e5] bg-white p-1.5 shadow-lg">
                  {moreTabs.map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setTab(status);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs hover:bg-[#f5f6f6]"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`size-1.5 rounded-full ${DOT[status]}`}
                        />
                        {status}
                      </span>
                      <span>{counts[status]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <button className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#242628] px-3 text-xs font-semibold text-white hover:bg-black">
                <Download size={14} />
                Export
              </button>
              <button className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#2563eb] px-3 text-xs font-semibold text-white hover:bg-[#1e52c5]">
                <Plus size={15} />
                Add new
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-[#fff7e7] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a16a0c]">
                SLA watch
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#80550d]">
                {overSla} Pending over SLA
              </p>
            </div>
            <div className="rounded-lg bg-[#fff2e6] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a65b18]">
                At dock
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#824915]">
                {counts.Docking} Docking
              </p>
            </div>
            <div className="rounded-lg bg-[#fff0f0] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a44a4a]">
                Peak backlog
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#873d3d]">
                Highest backlog:{" "}
                {rows.length
                  ? rows.reduce(
                      (peak, row) =>
                        row.backlogs > peak.backlogs ? row : peak,
                      rows[0],
                    ).dock
                  : "-"}
              </p>
            </div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-[#e1e4e5] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f0] p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9499]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cluster, dock, plate number"
                className="h-9 w-full rounded-lg border border-[#dfe3e4] bg-[#fbfcfc] pl-9 pr-3 text-xs outline-none focus:border-[#2563eb]"
              />
            </div>
            {(["region", "cluster", "dock", "lhSize"] as const).map((key) => (
              <select
                key={key}
                value={filters[key]}
                onChange={(event) =>
                  setFilters({ ...filters, [key]: event.target.value })
                }
                className="h-9 min-w-[112px] rounded-lg border border-[#dfe3e4] bg-white px-3 text-xs font-medium text-[#59646a]"
              >
                <option value="All">
                  {key === "lhSize"
                    ? "LH Size"
                    : key[0].toUpperCase() + key.slice(1)}
                  : All
                </option>
                {options[key].slice(1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ))}
            <button
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-1 px-2 text-xs font-semibold text-[#2563eb] hover:underline"
            >
              <X size={13} />
              Clear filters
            </button>
            <div className="relative ml-auto">
              <button
                onClick={() => setColumnsOpen(!columnsOpen)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe3e4] px-3 text-xs font-semibold text-[#59646a]"
              >
                <SlidersHorizontal size={14} />
                Columns
              </button>
              {columnsOpen && (
                <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-[#e1e4e5] bg-white p-2 shadow-lg">
                  {COLS.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#f5f6f6]"
                    >
                      <input
                        type="checkbox"
                        checked={visible.includes(key)}
                        onChange={() =>
                          setVisible((current) =>
                            current.includes(key)
                              ? current.filter((item) => item !== key)
                              : [...current, key],
                          )
                        }
                        className="accent-[#2563eb]"
                      />
                      {LABELS[key]}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#edf0f0] bg-[#fbfcfc] text-[10px] uppercase tracking-[.08em] text-[#899297]">
                  <th className="sticky left-0 z-10 w-[136px] bg-[#fbfcfc] px-4 py-3">
                    Status
                  </th>
                  {visible.map((key) => (
                    <th
                      key={key}
                      className={`px-3 py-3 ${key === "cluster" ? "w-[190px]" : key === "region" ? "w-[170px]" : ""}`}
                    >
                      <button
                        onClick={() =>
                          setSort((current) => ({
                            key,
                            direction:
                              current.key === key && current.direction === "asc"
                                ? "desc"
                                : "asc",
                          }))
                        }
                        className="inline-flex items-center gap-1"
                      >
                        {LABELS[key]}
                        <ArrowUpDown size={11} />
                      </button>
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 w-[190px] bg-[#fbfcfc] px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-[#f0f2f2] hover:bg-[#fcfdfd]"
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-[#fcfdfd]">
                      <button
                        onClick={() =>
                          setExpanded(expanded === row.id ? null : row.id)
                        }
                        className="mr-1 text-[#8b959a]"
                        aria-label={`${expanded === row.id ? "Collapse" : "Expand"} ${row.id}`}
                      >
                        {expanded === row.id ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${TONE[row.displayStatus]}`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${DOT[row.displayStatus]}`}
                        />
                        {row.displayStatus}
                      </span>
                    </td>
                    {visible.map((key) => (
                      <td
                        key={key}
                        className="max-w-[210px] px-3 py-2 text-[#4f5a60]"
                      >
                        {key === "runningTime" ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${row.runningTime < SLA_GREEN_HOURS ? "bg-[#edf8f1] text-[#28724f]" : row.runningTime <= SLA_AMBER_HOURS ? "bg-[#fff7e7] text-[#9a640b]" : "bg-[#fff0f0] text-[#a44a4a]"}`}
                          >
                            {formatHours(row.runningTime)}
                          </span>
                        ) : key === "requestTime" ? (
                          <span className="whitespace-nowrap">
                            {formatDate(row.requestTime)}
                          </span>
                        ) : key === "backlogs" ? (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#edf0f0]">
                              <span
                                className={`block h-full rounded-full ${row.backlogs >= maxBacklog * 0.8 ? "bg-[#c45454]" : "bg-[#7eafb2]"}`}
                                style={{
                                  width: `${Math.max(8, (row.backlogs / maxBacklog) * 100)}%`,
                                }}
                              />
                            </span>
                            {row.backlogs}
                          </span>
                        ) : (
                          <span
                            title={String(row[key] ?? "-")}
                            className={`block max-w-[190px] truncate ${row[key] == null ? "text-[#b0b7ba]" : ""}`}
                          >
                            {key === "plateNumber" && row.plateNumber
                              ? row.plateNumber.toUpperCase()
                              : (row[key] ?? "-")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 bg-white px-4 py-2 group-hover:bg-[#fcfdfd]">
                      <div className="relative flex items-center justify-end gap-1.5">
                        {actionsFor(row.displayStatus, _user.role).map(
                          (item) => (
                            <button
                              key={item.label}
                              disabled={requests.isFetching}
                              onClick={() =>
                                void action(row, item.next, item.apiAction)
                              }
                              className={`whitespace-nowrap rounded-md px-2 py-1.5 text-[10px] font-semibold disabled:opacity-50 ${item.danger ? "text-[#a44a4a] hover:bg-[#fff0f0]" : "bg-[#242628] text-white hover:bg-black"}`}
                            >
                              {item.label}
                            </button>
                          ),
                        )}
                        <button
                          aria-label={`More actions for ${row.id}`}
                          onClick={() =>
                            setSecondaryOpen(
                              secondaryOpen === row.id ? null : row.id,
                            )
                          }
                          className="rounded-md p-1.5 text-[#788389] hover:bg-[#eef1f1]"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {secondaryOpen === row.id && (
                          <div className="absolute right-0 top-8 z-20 w-32 rounded-lg border border-[#e1e4e5] bg-white p-1 shadow-lg">
                            {["View details", "Reroute", "Cancel", "Edit"].map(
                              (item) => (
                                <button
                                  key={item}
                                  onClick={() => setSecondaryOpen(null)}
                                  className="block w-full rounded px-2.5 py-2 text-left text-[11px] text-[#59646a] hover:bg-[#f5f6f6]"
                                >
                                  {item}
                                </button>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.map(
                  (row) =>
                    expanded === row.id && (
                      <tr key={`${row.id}-details`} className="bg-[#f8faf9]">
                        <td colSpan={visible.length + 2} className="px-12 py-3">
                          <div className="grid gap-3 text-xs sm:grid-cols-4">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[#8a9499]">
                                Linehaul trip
                              </p>
                              <p className="mt-1 font-semibold">
                                {row.linehaulTrip ?? "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[#8a9499]">
                                Plate number
                              </p>
                              <p className="mt-1 font-semibold">
                                {row.plateNumber?.toUpperCase() ?? "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[#8a9499]">
                                Timestamps
                              </p>
                              <p className="mt-1 text-[#59646a]">
                                Requested {formatDate(row.requestTime)}
                                <br />
                                Updated {formatDate(row.updated_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[#8a9499]">
                                History
                              </p>
                              <p className="mt-1 text-[#59646a]">
                                Created {formatDate(row.created_at)}
                                <br />
                                Status: {row.displayStatus}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                )}
                {shown.length === 0 && (
                  <tr>
                    <td
                      colSpan={visible.length + 2}
                      className="px-6 py-16 text-center"
                    >
                      <p className="font-semibold">
                        {requests.isLoading
                          ? "Loading requests"
                          : "No requests match these filters"}
                      </p>
                      <p className="mt-1 text-xs text-[#7c878c]">
                        {requests.isLoading
                          ? "Fetching the latest linehaul queue."
                          : "Try clearing the search or selecting a different status."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f0] px-4 py-3 text-xs text-[#7c878c]">
            <span>
              {shown.length ? `1-${shown.length} of ${shown.length}` : "0 of 0"}
            </span>
            <div className="flex items-center gap-4">
              <span>
                Rows per page{" "}
                <strong className="ml-1 font-semibold text-[#485258]">
                  25
                </strong>
              </span>
              <span>
                Page{" "}
                <strong className="ml-1 font-semibold text-[#485258]">
                  1 of 1
                </strong>
              </span>
            </div>
          </div>
        </section>
        {assignment && (
          <MidmileActionDialog
            selection={assignment}
            busy={assignmentBusy}
            error={assignmentError}
            onClose={() => {
              if (!assignmentBusy) setAssignment(null);
            }}
            onSubmit={async (payload) => {
              setAssignmentBusy(true);
              setAssignmentError(undefined);
              try {
                await api(
                  workflowActionPath(assignment.request.id, "assign-truck"),
                  {
                    method: "POST",
                    body: JSON.stringify(payload),
                  },
                );
                setAssignment(null);
                refreshManually();
              } catch (error) {
                setAssignmentError(
                  error instanceof Error
                    ? error.message
                    : "Unable to assign truck.",
                );
              } finally {
                setAssignmentBusy(false);
              }
            }}
          />
        )}
        {docking && (
          <DockDialog
            request={docking}
            actorRole={_user.role}
            action="mark-docked"
            busy={dockingBusy}
            onClose={() => {
              if (!dockingBusy) setDocking(null);
            }}
            onSubmit={async (payload) => {
              setDockingBusy(true);
              try {
                await api(workflowActionPath(docking.id, "mark-docked"), {
                  method: "POST",
                  body: JSON.stringify(payload),
                });
                setDocking(null);
                refreshManually();
              } catch {
                // The next request refresh surfaces the API error through the shared notice.
              } finally {
                setDockingBusy(false);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}
