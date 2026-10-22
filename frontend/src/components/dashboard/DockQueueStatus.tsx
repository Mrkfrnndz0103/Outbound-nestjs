import { CheckCircle2, type LucideIcon, Truck } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export type DockStatus = "Available" | "Docking" | "Occupied";
export interface DockItem {
  id: string;
  name: string;
  status: DockStatus;
  truckPlate: string | null;
  detail?: string;
}
export type DockQueueSource = "live" | "demo";
export type DockQueueStatusProps = {
  docks: DockItem[] | null;
  source: DockQueueSource;
  isLoading?: boolean;
  error?: string | null;
  lastUpdated?: Date | null;
  unavailableMessage?: string;
  emptyMessage?: string;
};

const statusConfig: Record<
  DockStatus,
  {
    icon: LucideIcon;
    badgeClass: string;
    markerClass: string;
    cardClass: string;
  }
> = {
  Available: {
    icon: CheckCircle2,
    badgeClass:
      "border-status-success-ink/25 bg-status-success-surface text-status-success-ink",
    markerClass: "bg-status-success-ink",
    cardClass: "border-status-success-ink/20 bg-status-success-surface/40",
  },
  Occupied: {
    icon: CheckCircle2,
    badgeClass:
      "border-status-info-ink/25 bg-status-info-surface text-status-info-ink",
    markerClass: "bg-status-info-ink",
    cardClass: "border-status-info-ink/20 bg-status-info-surface/40",
  },
  Docking: {
    icon: Truck,
    badgeClass:
      "border-status-pending-ink/25 bg-status-pending-surface text-status-pending-ink",
    markerClass: "bg-status-pending-ink",
    cardClass: "border-status-pending-line/70 bg-status-pending-surface/40",
  },
};
const legendStatuses: DockStatus[] = ["Occupied", "Docking", "Available"];
const panelClass =
  "dock-panel grid min-w-0 overflow-hidden rounded-[16px] border border-card-line bg-card-surface px-3.5 py-3.5 shadow-card max-[700px]:rounded-[12px] max-[700px]:p-2.5";
const headerClass =
  "flex items-start justify-between gap-4 max-[700px]:flex-col max-[700px]:gap-3";
const headingClass =
  "m-0 flex min-w-0 items-center gap-3 text-[18px] leading-tight font-semibold tracking-[-0.02em] text-card-heading";
const headingIconClass =
  "grid size-[50px] shrink-0 place-items-center rounded-[15px] bg-status-info-surface text-[#1675e5]";
const subtitleClass = "mt-1 mb-0 text-sm leading-normal text-soc5-muted";
const updatedClass = "mt-0.5 mb-0 text-[10px] text-soc5-muted";
const legendClass =
  "m-0 flex list-none flex-wrap items-center gap-x-7 gap-y-1.5 p-0 pt-2 text-sm text-soc5-muted max-[700px]:gap-x-4 max-[700px]:pt-0";
const legendItemClass = "inline-flex items-center gap-2 whitespace-nowrap";
const legendMarkerClass = "size-2.5 shrink-0 rounded-full";
const gridClass =
  "mt-3 grid min-w-0 list-none grid-flow-col auto-cols-[110px] grid-rows-1 gap-3 overflow-x-auto overscroll-x-contain p-0 pb-1 [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1675e5]";
const cardClass =
  "grid h-[142px] w-[110px] shrink-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-[10px] border p-[11px] max-[700px]:h-[138px] max-[420px]:p-2";
const cardNameClass =
  "m-0 min-w-0 truncate text-sm leading-tight font-semibold text-card-heading";
const badgeClass =
  "inline-flex h-[34px] max-w-full min-w-0 items-center justify-self-start rounded-full border px-4 text-xs leading-none font-semibold max-[420px]:px-3";
const truckDetailClass =
  "mt-1 flex min-w-0 items-start gap-2 text-sm leading-tight text-soc5-ink";
const truckIconClass = "mt-0.5 size-5 shrink-0 text-[#24334c]";
const truckDetailTextClass = "grid min-w-0 gap-1";
const plateClass = "min-w-0 truncate font-medium tabular-nums";
const detailClass = "min-w-0 truncate text-sm text-soc5-muted";
const messageClass = "m-0 mt-2.5 text-xs text-soc5-muted";
const errorClass = "m-0 mt-2.5 text-xs text-[var(--color-danger)]";

function formatUpdatedTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DockQueueStatus({
  docks,
  source,
  isLoading = false,
  error = null,
  lastUpdated = null,
  unavailableMessage = "Dock status feed is not connected.",
  emptyMessage = "No docks reported.",
}: DockQueueStatusProps) {
  const headingId = useId();
  const showLoading = isLoading && !docks;
  const subtitle =
    docks === null
      ? "Dock occupancy data is not available yet."
      : source === "live"
        ? "Live dock availability with trucks from active requests."
        : "Demo layout for preview only. Not live dock data.";
  let body: ReactNode;
  if (error)
    body = (
      <p className={errorClass} role="alert">
        {error}
      </p>
    );
  else if (showLoading)
    body = (
      <>
        <p className="sr-only" role="status">
          Loading dock status.
        </p>
        <ul className={gridClass} aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-[142px] rounded-[10px]" />
            </li>
          ))}
        </ul>
      </>
    );
  else if (docks === null)
    body = (
      <p className={messageClass} role="status">
        {unavailableMessage}
      </p>
    );
  else if (docks.length === 0)
    body = <p className={messageClass}>{emptyMessage}</p>;
  else
    body = (
      <ul className={gridClass} aria-label="Docks" tabIndex={0}>
        {docks.map((dock) => {
          const config = statusConfig[dock.status];
          const StatusIcon = config.icon;
          return (
            <li
              key={dock.id}
              data-dock-status={dock.status}
              className={`${cardClass} ${config.cardClass}`}
            >
              <h3 className={cardNameClass} title={dock.name}>
                {dock.name}
              </h3>
              <span className={`${badgeClass} ${config.badgeClass}`}>
                <span className="min-w-0 truncate">{dock.status}</span>
              </span>
              <div className={truckDetailClass}>
                <StatusIcon
                  className={truckIconClass}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className={truckDetailTextClass}>
                  <span
                    className={plateClass}
                    title={dock.truckPlate ?? undefined}
                  >
                    {dock.truckPlate ?? "—"}
                  </span>
                  {dock.detail ? (
                    <span className={detailClass} title={dock.detail}>
                      {dock.detail}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  return (
    <section
      className={panelClass}
      aria-labelledby={headingId}
      aria-busy={showLoading}
    >
      <header className={headerClass}>
        <div className="min-w-0">
          <h2 id={headingId} className={headingClass}>
            <span className={headingIconClass} aria-hidden="true">
              <Truck size={28} strokeWidth={2.1} />
            </span>
            <span className="min-w-0">Dock &amp; Queue Status</span>
          </h2>
          <p className={subtitleClass}>{subtitle}</p>
          {lastUpdated ? (
            <p className={updatedClass}>
              Last updated{" "}
              <time dateTime={lastUpdated.toISOString()}>
                {formatUpdatedTime(lastUpdated)}
              </time>
            </p>
          ) : null}
        </div>
        <ul className={legendClass} aria-label="Dock status legend">
          {legendStatuses.map((status) => (
            <li key={status} className={legendItemClass}>
              <i
                className={`${legendMarkerClass} ${statusConfig[status].markerClass}`}
                aria-hidden="true"
              />
              {status}
            </li>
          ))}
        </ul>
      </header>
      {body}
    </section>
  );
}
