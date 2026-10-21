import { CalendarDays, Download, RefreshCw, Search } from "lucide-react";
import {
  iconButtonClass,
  requestControlActionsClass,
  requestControlsClass,
  requestExportButtonClass,
  requestFilterClass,
  requestSearchClass,
  requestStatusBadgeActiveClass,
  requestStatusBadgeClass,
  requestStatusTabActiveClass,
  requestStatusTabClass,
  requestStatusTabsClass,
  requestToolbarClass,
} from "../lib/uiClasses";
import type { RequestFilters as Filters, Status } from "../types";

export const statuses: Array<Status | "ALL"> = [
  "ALL",
  "PENDING",
  "REQUESTED",
  "REROUTED",
  "ASSIGNED",
  "DOCKING",
  "DOCKED",
  "REJECTED",
  "CANCELLED",
];

type Props = {
  filters: Filters;
  exporting: boolean;
  statusSummary?: Array<{ value: Status | "ALL"; count: number }>;
  hideStatusFilter?: boolean;
  onChange: (next: Filters) => void;
  onExport: () => void;
  onRefresh: () => void;
};

export function RequestFilters({
  filters,
  exporting,
  statusSummary = [],
  hideStatusFilter = false,
  onChange,
  onExport,
  onRefresh,
}: Props) {
  function change(values: Partial<Filters>) {
    onChange({ ...filters, ...values, page: 1 });
  }

  const tabs = statusSummary.length
    ? statusSummary
    : statuses.map((value) => ({ value, count: 0 }));
  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = filters.dateFrom || today;

  return (
    <section className={requestControlsClass} aria-label="Request filters">
      <div
        className={requestStatusTabsClass}
        role="tablist"
        aria-label="Request status tabs"
      >
        {tabs.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <button
              key={tab.value}
              className={`${requestStatusTabClass} ${active ? requestStatusTabActiveClass : ""}`}
              type="button"
              onClick={() => change({ status: tab.value as Status | "ALL" })}
            >
              <span>
                {tab.value === "ALL" ? "All" : tab.value.replaceAll("_", " ")}
              </span>
              <span
                className={`${requestStatusBadgeClass} ${active ? requestStatusBadgeActiveClass : ""}`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className={requestToolbarClass}>
        <label className={requestSearchClass} htmlFor="request-search">
          <Search size={16} />
          <input
            id="request-search"
            aria-label="Search requests"
            placeholder="Search"
            value={filters.search}
            onChange={(event) => change({ search: event.target.value })}
          />
        </label>
        <label className={requestFilterClass} htmlFor="request-date">
          <CalendarDays size={16} />
          <input
            id="request-date"
            type="date"
            value={selectedDate}
            onChange={(event) =>
              change({
                dateFrom: event.target.value,
                dateTo: event.target.value,
              })
            }
          />
        </label>
        {!hideStatusFilter && (
          <label className={requestFilterClass}>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                change({ status: event.target.value as Status | "ALL" })
              }
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={requestControlActionsClass}>
          <button
            className={`${iconButtonClass} min-h-[1.9rem]`}
            type="button"
            title="Refresh requests"
            aria-label="Refresh requests"
            onClick={onRefresh}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className={requestExportButtonClass}
            type="button"
            disabled={exporting}
            onClick={onExport}
          >
            <Download size={16} />
            {exporting ? "Exporting" : "CSV"}
          </button>
        </div>
      </div>
    </section>
  );
}
