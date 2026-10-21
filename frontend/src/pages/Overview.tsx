import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock3, Truck, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartHeader } from "../components/dashboard/ChartHeader";
import {
  IntradayDateSelector,
  IntradayKpi,
  IntradayLineChart,
  IntradayLiveStatus,
} from "../components/dashboard/IntradayCharts";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Panel } from "../components/dashboard/Panel";
import { QueuePreview } from "../components/dashboard/QueuePreview";
import { Modal } from "../components/Modal";
import { RequestTable } from "../components/RequestTable";
import { SkeletonTable } from "../components/SkeletonTable";
import { api } from "../lib/api";
import {
  avatarClass,
  dashboardGridClass,
  dashboardPanelBodyClass,
  dashboardPanelClass,
  dashboardPanelHeadClass,
  dashboardPanelKickerClass,
  dashboardTripsPanelClass,
  dashboardViewClass,
  dialogHeadClass,
  donutCenterClass,
  donutCenterLabelClass,
  donutCenterValueClass,
  donutClass,
  donutLayoutClass,
  donutLegendClass,
  donutLegendItemClass,
  donutLegendSwatchClass,
  donutLegendValueClass,
  iconButtonClass,
  intradayCardClass,
  intradayMetaDotClass,
  intradayShellClass,
  linehaulRowClass,
  loadingChipClass,
  loadingShellClass,
  loadingToolbarClass,
  mutedCaptionClass,
  overviewMetricsClass,
  queueRowGroupClass,
  requestDetailContentClass,
  requestDetailCopyClass,
  requestDetailDialogClass,
  requestDetailTitleClass,
  scorecardsLayoutClass,
  textButtonClass,
  timingMetricsClass,
  tripsPanelBodyClass,
  truckDotClass,
} from "../lib/uiClasses";
import { useUiStore } from "../stores/ui";
import type {
  AppView,
  Page,
  RequestDashboardSummary,
  Status,
  TruckRequest,
  User,
} from "../types";

const INTRADAY_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2,
  3, 4, 5,
] as const;

import type { IntradayChartPoint } from "../components/dashboard/IntradayCharts";

function getTodayDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatDurationMinutes(minutes?: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return "-";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points.reduce((path, point, index, all) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = all[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export function Overview({
  onNavigate,
  preview = false,
}: {
  user: User;
  onNavigate: (view: AppView) => void;
  preview?: boolean;
}) {
  const from = useUiStore((state) => state.dateFrom);
  const to = useUiStore((state) => state.dateTo);
  const [detailStatus, setDetailStatus] = useState<Status | "ALL" | null>(null);
  const [intradayDate, setIntradayDate] = useState(() => getTodayDate());
  const [activeIntradayPoint, setActiveIntradayPoint] =
    useState<IntradayChartPoint | null>(null);
  const [refreshPulse, setRefreshPulse] = useState(false);
  const range = `date_from=${from}&date_to=${to}`;
  const requests = useQuery({
    queryKey: ["requests", "dashboard"],
    queryFn: () =>
      api<Page<TruckRequest>>(
        "/requests?per_page=20&sort=created_at&direction=desc",
      ),
    placeholderData: (previous) => previous,
    refetchInterval: false,
    enabled: !preview,
  });
  const summary = useQuery({
    queryKey: ["request-summary", from, to],
    queryFn: () => api<RequestDashboardSummary>(`/requests/summary?${range}`),
    refetchInterval: false,
    enabled: !preview,
  });
  const intraday = useQuery({
    queryKey: ["intraday-dispatch", intradayDate],
    queryFn: () =>
      api<{ data: Array<{ hour: number; orderQty: number }> }>(
        `/dispatch/intraday?date=${intradayDate}`,
      ),
    refetchInterval: false,
    staleTime: 10_000,
    enabled: !preview,
  });
  useEffect(() => {
    if (!intraday.dataUpdatedAt) return;
    setRefreshPulse(true);
    const timeout = window.setTimeout(() => setRefreshPulse(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [intraday.dataUpdatedAt]);
  const details = useQuery({
    queryKey: ["request-details", detailStatus, from, to],
    queryFn: () =>
      api<Page<TruckRequest>>(
        `/requests?per_page=100&${range}${detailStatus !== "ALL" ? `&status=${detailStatus}` : ""}`,
      ),
    enabled: detailStatus !== null,
  });
  const dispatchChart = useMemo(() => {
    const points =
      intraday.data?.data ??
      INTRADAY_HOURS.map((hour) => ({ hour, orderQty: 0 }));
    const maximum = Math.max(1, ...points.map((point) => point.orderQty));
    const peak = points.reduce(
      (best, point) => (point.orderQty > best.orderQty ? point : best),
      { hour: 0, orderQty: 0 },
    );
    const total = points.reduce((sum, point) => sum + point.orderQty, 0);
    const chartPoints: IntradayChartPoint[] = points.map((point, index) => ({
      label: String(point.hour),
      hour: point.hour,
      count: point.orderQty,
      x: 46 + index * (points.length > 1 ? 608 / (points.length - 1) : 0),
      y: 150 - (point.orderQty / maximum) * 104,
    }));
    const line = smoothPath(chartPoints);

    return {
      maximum,
      peak,
      chartPoints,
      line,
      area: chartPoints.length
        ? `${line} L ${chartPoints[chartPoints.length - 1].x} 160 L ${chartPoints[0].x} 160 Z`
        : "",
      total,
    };
  }, [intraday.data?.data]);
  const sizes = ["4W", "4WAUV", "4WCV", "6W", "10W", "6WF"] as const;
  const truckSizes = summary.data?.analytics.truck_sizes ?? {};
  const sizeTotal = sizes.reduce(
    (sum, size) => sum + (truckSizes[size] ?? 0),
    0,
  );
  const rows = requests.data?.data ?? [];
  const linehaulTrips = rows
    .filter((request) => request.linehaul_trip_no || request.driver_id)
    .slice(0, 4);
  const assignedTrucks = rows
    .filter(
      (request) =>
        (request.status === "DOCKING" || request.status === "ASSIGNED") &&
        request.plate_number,
    )
    .slice(0, 4);
  const palette = ["2f6f6a", "3f8f89", "77b7af", "dbece8"];
  const gradients = useMemo(() => {
    let offset = 0;
    return sizes
      .map((size, index) => {
        const value = truckSizes[size] ?? 0;
        const start = offset;
        offset += sizeTotal ? (value / sizeTotal) * 100 : 0;
        return `#${palette[index]} ${start}% ${offset}%`;
      })
      .join(",");
  }, [sizeTotal, truckSizes]);
  const totalRequests = summary.data?.metrics.total ?? 0;
  const byStatus = summary.data?.metrics.by_status ?? {};
  const pendingRequests = byStatus.PENDING ?? 0;
  const forDockingRequests = byStatus.DOCKING ?? 0;
  const dockedRequests = byStatus.DOCKED ?? 0;
  const completionRate = totalRequests
    ? Math.round((dockedRequests / totalRequests) * 100)
    : 0;
  const cards: Array<{
    label: string;
    status: Status | "ALL";
    value: number;
    icon: ReactNode;
    chip: string;
    footnote: string;
    primary?: boolean;
  }> = [
    {
      label: "Total Requests",
      status: "ALL",
      value: totalRequests,
      icon: <ClipboardList size={22} aria-hidden="true" />,
      chip: "Overall volume",
      footnote: `Intraday chart: ${dispatchChart.total.toLocaleString()} dispatches on ${intradayDate}`,
    },
    {
      label: "Pending Requests",
      status: "PENDING",
      value: pendingRequests,
      icon: <Clock3 size={22} aria-hidden="true" />,
      chip: "Needs action",
      footnote: `${totalRequests ? Math.round((pendingRequests / totalRequests) * 100) : 0}% of all requests`,
      primary: true,
    },
    {
      label: "Awaiting Docking",
      status: "DOCKING",
      value: forDockingRequests,
      icon: <Truck size={22} aria-hidden="true" />,
      chip: "Dock queue",
      footnote: "Waiting for dock confirmation",
    },
    {
      label: "Completed",
      status: "DOCKED",
      value: dockedRequests,
      icon: <CheckCircle2 size={22} aria-hidden="true" />,
      chip: "Completed",
      footnote: `${completionRate}% completion rate`,
    },
  ];
  const intradayStatus = intraday.isPending
    ? "Loading live dispatch data."
    : intraday.error
      ? "Dispatch feed unavailable."
      : "Live dispatch data via realtime.";
  const formatHour = useCallback(
    (hour: number) => `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`,
    [],
  );

  return (
    <div className={`${dashboardViewClass} dashboard-overview`}>
      {(requests.error || summary.error || intraday.error) && (
        <p className="error notice text-[var(--color-danger)]" role="alert">
          Some dashboard data could not be loaded. Check the affected panel for
          details.
        </p>
      )}
      <section className={scorecardsLayoutClass} aria-label="Dashboard metrics">
        <section className={overviewMetricsClass} aria-label="Request metrics">
          {cards.map((card) => (
            <MetricCard
              key={card.status}
              label={card.label}
              value={
                summary.isPending ? (
                  <Skeleton className="h-[26px] w-[64px]" />
                ) : (
                  card.value.toLocaleString()
                )
              }
              icon={card.icon}
              chip={card.chip}
              footnote={
                summary.isPending ? (
                  <Skeleton className="h-2.5 w-[112px]" />
                ) : (
                  card.footnote
                )
              }
              primary={card.primary}
              onClick={() => setDetailStatus(card.status)}
            />
          ))}
        </section>
        <section
          className={intradayShellClass}
          aria-label="Intraday dispatch card"
        >
          <article className={intradayCardClass}>
            <ChartHeader
              title="Hourly Throughput"
              description={
                <>
                  <span className={intradayMetaDotClass} aria-hidden="true" />
                  <span>Live operational feed</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={intradayDate}>{intradayDate}</time>
                </>
              }
              controls={
                <IntradayDateSelector
                  value={intradayDate}
                  onChange={setIntradayDate}
                />
              }
            />
            <div className="grid grid-cols-[minmax(7.5rem,max-content)_minmax(7.5rem,max-content)_minmax(10.5rem,1fr)] items-center gap-[clamp(.7rem,2vw,1.1rem)] max-[820px]:grid-cols-3 max-[600px]:grid-cols-1 max-[600px]:gap-[.7rem]">
              <IntradayKpi
                label="Total dispatched"
                loading={intraday.isPending}
                value={dispatchChart.total.toLocaleString()}
              />
              <IntradayKpi
                label="Peak hour"
                loading={intraday.isPending}
                value={dispatchChart.peak.orderQty.toLocaleString()}
                suffix={formatHour(dispatchChart.peak.hour)}
                accent
              />
              <IntradayLiveStatus
                error={Boolean(intraday.error)}
                refreshing={intraday.isFetching && !intraday.isPending}
                refreshed={refreshPulse}
                text={intradayStatus}
              />
            </div>
            <IntradayLineChart
              activePoint={activeIntradayPoint}
              area={dispatchChart.area}
              formatHour={formatHour}
              line={dispatchChart.line}
              maximum={dispatchChart.maximum}
              points={dispatchChart.chartPoints}
              onActivePointChange={setActiveIntradayPoint}
            />
          </article>
        </section>
      </section>
      <section
        className={timingMetricsClass}
        aria-label="Request timing metrics"
      >
        <MetricCard
          label="Average Dwell time"
          value={
            summary.isPending ? (
              <Skeleton className="h-[26px] w-[64px]" />
            ) : (
              formatDurationMinutes(
                summary.data?.analytics.average_dwell_minutes,
              )
            )
          }
          icon={<Clock3 size={22} aria-hidden="true" />}
          chip="Request to Depart"
          footnote="Request to LHTrip entry"
          onClick={() => setDetailStatus("ALL")}
        />
        <MetricCard
          label="Average Waiting Time"
          value={
            summary.isPending ? (
              <Skeleton className="h-[26px] w-[64px]" />
            ) : (
              formatDurationMinutes(
                summary.data?.analytics.average_waiting_minutes,
              )
            )
          }
          icon={<Truck size={22} aria-hidden="true" />}
          chip="Request to plate"
          footnote="Request to FTE MM plate assignment"
          onClick={() => setDetailStatus("ALL")}
        />
      </section>
      <section className={dashboardGridClass}>
        <Panel
          className="chart-panel truck-mix-panel"
          kicker="Distribution"
          title="Truck mix"
          description="Selected date range"
        >
          <div className={donutLayoutClass}>
            <div
              className={donutClass}
              style={{
                background: sizeTotal
                  ? `conic-gradient(${gradients})`
                  : "var(--color-bg-base)",
              }}
            >
              <span className={donutCenterClass}>
                <strong className={donutCenterValueClass}>{sizeTotal}</strong>
                <small className={donutCenterLabelClass}>Total</small>
              </span>
            </div>
            <section
              className={donutLegendClass}
              aria-label="Truck size breakdown"
            >
              {sizes.map((size, index) => {
                const count = truckSizes[size] ?? 0;
                return (
                  <div className={donutLegendItemClass} key={size}>
                    <i
                      className={donutLegendSwatchClass}
                      style={{ background: `#${palette[index]}` }}
                    />
                    <span className={mutedCaptionClass}>{size}</span>
                    <strong className={donutLegendValueClass}>
                      {count}{" "}
                      <small>
                        ({sizeTotal ? Math.round((count / sizeTotal) * 100) : 0}
                        %)
                      </small>
                    </strong>
                  </div>
                );
              })}
            </section>
          </div>
        </Panel>
        <article
          className={`${dashboardPanelClass} ${dashboardTripsPanelClass}`}
        >
          <div
            className={`${dashboardPanelHeadClass} border-b border-[#087f7c]/[.24] pb-[.65rem]`}
          >
            <div>
              <p
                className={`${dashboardPanelKickerClass} !text-linehaul-teal-ink`}
              >
                Live dispatch board
              </p>
              <h2 className="m-0 text-sm font-semibold text-soc5-ink">
                Recent linehaul trips
              </h2>
              <p className="mt-1 mb-0 text-xs leading-normal text-soc5-ink">
                Latest trips with driver assignments
              </p>
            </div>
            <span className="trips-live-status">
              <i aria-hidden="true" /> Live
            </span>
            <button
              className={textButtonClass}
              type="button"
              onClick={() => onNavigate("docking")}
            >
              View All
            </button>
          </div>
          <div className={tripsPanelBodyClass}>
            <QueuePreview
              items={linehaulTrips}
              emptyMessage="No linehaul trips have been created yet."
              renderItem={(request) => (
                <div className={linehaulRowClass} key={request.id}>
                  <span className={avatarClass}>
                    {(request.driver_id || request.created_by)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className={queueRowGroupClass}>
                    <strong>
                      {request.linehaul_trip_no || "Trip pending"}
                    </strong>
                    <small>Doc Officer: {request.created_by}</small>
                  </div>
                  <span className={`${queueRowGroupClass} min-w-0`}>
                    <b>{request.driver_id || "Driver pending"}</b>
                    <small>Assigned driver</small>
                  </span>
                  <span
                    className={`${queueRowGroupClass} justify-items-end text-right`}
                  >
                    <b>{request.cluster}</b>
                    <small>Cluster</small>
                  </span>
                </div>
              )}
            />
          </div>
        </article>
        <article className={`${dashboardPanelClass} min-h-[15.5rem]`}>
          <div className={dashboardPanelHeadClass}>
            <div>
              <p
                className={`${dashboardPanelKickerClass} !text-linehaul-teal-ink`}
              >
                Docking queue
              </p>
              <h2 className="m-0 text-sm font-semibold text-soc5-ink">
                Trucks awaiting docking
              </h2>
              <p className="mt-1 mb-0 text-xs leading-normal text-soc5-ink">
                Assigned trucks ready for dock confirmation
              </p>
            </div>
            <button
              className={textButtonClass}
              type="button"
              onClick={() => onNavigate("docking")}
            >
              View All
            </button>
          </div>
          <div
            className={`${dashboardPanelBodyClass} bg-linehaul-lime-surface`}
          >
            <QueuePreview
              items={assignedTrucks}
              className="truck-list"
              emptyMessage="No assigned trucks are ready for docking."
              renderItem={(request) => (
                <div
                  className={`${linehaulRowClass} border-soc5-line bg-soc5-panel shadow-[0_.25rem_.7rem_rgb(83_104_13_/_8%)]`}
                  key={request.id}
                >
                  <span className={truckDotClass}>
                    <Truck size={15} />
                  </span>
                  <div className={queueRowGroupClass}>
                    <strong>{request.cluster}</strong>
                    <small>{request.status.replaceAll("_", " ")}</small>
                  </div>
                  <span>{request.plate_number}</span>
                  <span>{request.truck_size}</span>
                </div>
              )}
            />
          </div>
        </article>
      </section>
      <Modal
        open={detailStatus !== null}
        onClose={() => setDetailStatus(null)}
        className={requestDetailDialogClass}
        ariaLabelledBy="request-details-title"
      >
        <div className={dialogHeadClass}>
          <div>
            <h2 className={requestDetailTitleClass} id="request-details-title">
              {cards.find((card) => card.status === detailStatus)?.label}
            </h2>
            <p className={requestDetailCopyClass}>
              {from} to {to} - {details.data?.total ?? 0} requests
            </p>
          </div>
          <button
            className={iconButtonClass}
            type="button"
            aria-label="Close"
            onClick={() => setDetailStatus(null)}
          >
            <X size={18} />
          </button>
        </div>
        {details.isPending ? (
          <div className={loadingShellClass}>
            <div className={loadingToolbarClass}>
              <span className={loadingChipClass} />
              <span className={loadingChipClass} />
              <span className={loadingChipClass} />
            </div>
            <SkeletonTable columns={14} rows={4} compact />
          </div>
        ) : (
          <RequestTable
            rows={details.data?.data ?? []}
            tableWrapperClassName={requestDetailContentClass}
            emptyStateClassName={requestDetailContentClass}
          />
        )}
      </Modal>
    </div>
  );
}
