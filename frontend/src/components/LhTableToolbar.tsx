import {
  ArrowUpDown,
  ChevronDown,
  Download,
  Filter,
  Plus,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TableDensity } from "../hooks/useLinehaulTablePreferences";
import type { RequestRefreshReason } from "../lib/requestRefresh";
import { defaultRequestFilters } from "../lib/requests";
import type { RequestFilters, RequestSort } from "../types";
import {
  ColumnVisibilityMenu,
  linehaulColumnOptions,
} from "./ColumnVisibilityMenu";
import { statuses } from "./RequestFilters";

const menuButtonClass =
  "flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-soc5-line bg-soc5-panel px-2.5 py-1.5 text-sm text-soc5-ink transition-[color,border-color,background-color,box-shadow,transform] duration-200 hover:border-linehaul-teal/20 hover:bg-linehaul-surface-soft hover:text-linehaul-teal-ink hover:shadow-[var(--lh-2026-shadow-sm)] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linehaul-teal max-[480px]:w-full max-[480px]:justify-center";
const popoverClass =
  "absolute top-[calc(100%+8px)] left-0 z-20 grid min-w-[190px] gap-2.5 rounded-[10px] border border-soc5-line bg-linehaul-surface p-3 shadow-[0_12px_28px_#1f4b4d1f] animate-[lh-popover-in_.18s_ease_both] max-[480px]:right-0 max-[480px]:left-auto";
const actionButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-medium transition-[color,border-color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linehaul-teal/40 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";
const filterChipClass =
  "inline-flex min-h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-soc5-line bg-linehaul-teal-soft px-1.5 text-xs font-semibold text-soc5-ink hover:border-soc5-line hover:bg-linehaul-teal-soft hover:text-soc5-ink";
const clearFiltersClass =
  "inline-flex min-h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-soc5-line bg-soc5-panel px-1.5 text-xs font-semibold text-soc5-muted hover:border-soc5-line hover:bg-linehaul-teal-soft hover:text-soc5-ink";
const densityToggleClass =
  "inline-flex min-h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-soc5-line bg-soc5-panel px-2 text-xs font-semibold text-soc5-muted hover:border-soc5-line hover:bg-linehaul-teal-soft hover:text-soc5-ink aria-[pressed=true]:border-soc5-line aria-[pressed=true]:bg-linehaul-teal-soft";
const searchWrapClass =
  "relative order-first ml-auto w-full min-w-[9rem] max-w-[15.5rem] flex-1 max-[760px]:order-none max-[760px]:basis-full max-[480px]:col-span-full lg:order-none";
const searchInputClass =
  "min-h-9 w-full rounded-[9px] border border-linehaul-line bg-linehaul-surface py-1.5 pr-3 pl-9 text-sm text-soc5-ink placeholder:text-gray-400 focus:border-linehaul-teal/30 focus:outline-none focus:ring-[3px] focus:ring-linehaul-teal/10";
const menuOptionClass =
  "min-h-[30px] cursor-pointer rounded-md border-0 bg-transparent px-2 text-left text-xs capitalize text-soc5-ink hover:bg-linehaul-teal-soft hover:text-linehaul-teal-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-linehaul-teal";
type Props = {
  filters: RequestFilters;
  exporting?: boolean;
  onChange: (next: RequestFilters) => void;
  onSort: (sort: RequestSort) => void;
  onExport: () => void;
  onRefresh?: () => void;
  onAddNew?: () => void;
  showColumnSettings?: boolean;
  showCreateNew?: boolean;
  visibleColumns: string[];
  onColumnsChange: (next: string[]) => void;
  density: TableDensity;
  onDensityChange: (next: TableDensity) => void;
  lastUpdated?: number;
  refreshReason?: RequestRefreshReason;
};

export function LhTableToolbar({
  filters,
  onChange,
  onSort,
  onExport,
  onAddNew,
  exporting = false,
  showColumnSettings = true,
  showCreateNew = true,
  visibleColumns,
  onColumnsChange,
  density,
  onDensityChange,
  lastUpdated,
  refreshReason,
}: Props) {
  const [openMenu, setOpenMenu] = useState<
    "status" | "filters" | "sort" | "mobileFilters" | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const set = (values: Partial<RequestFilters>) =>
    onChange({ ...filters, ...values, page: 1 });
  const activeFilterCount =
    Number(filters.status !== "ALL") +
    Number(Boolean(filters.dateFrom || filters.dateTo)) +
    Number(Boolean(filters.search.trim()));

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function clearAllFilters() {
    onChange({
      ...filters,
      ...defaultRequestFilters,
      sort: filters.sort,
      direction: filters.direction,
      perPage: filters.perPage,
      page: 1,
    });
    setOpenMenu(null);
  }

  function filterChip(label: string, onClear: () => void) {
    return (
      <button
        className={filterChipClass}
        key={label}
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
      >
        <span>{label}</span>
        <X size={12} aria-hidden="true" />
      </button>
    );
  }

  const filterChips = [
    filters.status !== "ALL"
      ? filterChip(`Status: ${filters.status.replaceAll("_", " ")}`, () =>
          set({ status: "ALL" }),
        )
      : null,
    filters.dateFrom || filters.dateTo
      ? filterChip(
          `Date: ${filters.dateFrom || "…"} – ${filters.dateTo || "…"}`,
          () => set({ dateFrom: "", dateTo: "" }),
        )
      : null,
    filters.search.trim()
      ? filterChip(`Search: ${filters.search.trim()}`, () =>
          set({ search: "" }),
        )
      : null,
  ].filter(Boolean);

  const sortOptions: RequestSort[] = [
    "request_timestamp",
    "cluster",
    "dock_no",
    "backlogs",
    "plate_number",
  ];

  function renderStatusOptions() {
    return statuses.map((status) => (
      <button
        className={menuOptionClass}
        key={status}
        type="button"
        role="menuitem"
        onClick={() => {
          set({ status });
          setOpenMenu(null);
        }}
      >
        {status === "ALL" ? "All statuses" : status.replaceAll("_", " ")}
      </button>
    ));
  }

  function renderSortOptions() {
    return sortOptions.map((sort) => (
      <button
        className={menuOptionClass}
        key={sort}
        type="button"
        role="menuitem"
        onClick={() => {
          onSort(sort);
          setOpenMenu(null);
        }}
      >
        {sort.replaceAll("_", " ")}
      </button>
    ));
  }

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-wrap flex-col items-center gap-3 min-[481px]:flex-row max-[1120px]:gap-[.35rem] max-[760px]:gap-2.5 max-[680px]:p-[.45rem] max-[480px]:grid max-[480px]:grid-cols-2 lg:flex-row"
    >
      <div className="relative inline-flex max-[760px]:order-none max-[760px]:flex-none">
        <button
          className={`${menuButtonClass} ${filters.status !== "ALL" ? "border-soc5-line bg-linehaul-teal-soft text-soc5-ink" : ""}`}
          type="button"
          aria-expanded={openMenu === "status"}
          onClick={() => setOpenMenu(openMenu === "status" ? null : "status")}
        >
          <Filter size={15} aria-hidden="true" />
          <span>Status{filters.status !== "ALL" ? " • 1" : ""}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === "status" && (
          <div
            className={`${popoverClass} min-w-40 gap-[3px] p-1.5`}
            role="menu"
            aria-label="Filter by request status"
          >
            {renderStatusOptions()}
          </div>
        )}
      </div>
      <div className="relative inline-flex max-[760px]:order-none max-[760px]:flex-none">
        <button
          className={`${menuButtonClass} ${openMenu === "filters" ? "border-soc5-line bg-linehaul-teal-soft text-soc5-ink" : ""}`}
          type="button"
          aria-expanded={openMenu === "filters"}
          onClick={() => setOpenMenu(openMenu === "filters" ? null : "filters")}
        >
          <Filter size={15} aria-hidden="true" />
          <span>
            All filter{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === "filters" && (
          <fieldset
            className={popoverClass}
            aria-label="Request filter controls"
          >
            <label className="grid gap-1.5 text-sm font-medium text-soc5-muted">
              Date
              <input
                className="min-h-[34px] rounded-[7px] border border-soc5-line bg-linehaul-surface px-2 text-xs text-soc5-ink"
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  set({
                    dateFrom: event.target.value,
                    dateTo: event.target.value,
                  })
                }
              />
            </label>
          </fieldset>
        )}
      </div>
      <div className="relative inline-flex max-[760px]:order-none max-[760px]:flex-none">
        <button
          className={`${menuButtonClass} ${openMenu === "sort" ? "border-soc5-line bg-linehaul-teal-soft text-soc5-ink" : ""}`}
          type="button"
          aria-expanded={openMenu === "sort"}
          onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
        >
          <ArrowUpDown size={15} aria-hidden="true" />
          <span>Sort by</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === "sort" && (
          <div
            className={`${popoverClass} min-w-40 gap-[3px] p-1.5`}
            role="menu"
            aria-label="Sort requests"
          >
            {renderSortOptions()}
          </div>
        )}
      </div>
      <div className="relative hidden max-[760px]:inline-flex">
        <button
          className={`${menuButtonClass} ${activeFilterCount ? "border-soc5-line bg-linehaul-teal-soft text-soc5-ink" : ""}`}
          type="button"
          aria-expanded={openMenu === "mobileFilters"}
          onClick={() =>
            setOpenMenu(openMenu === "mobileFilters" ? null : "mobileFilters")
          }
        >
          <Filter size={15} aria-hidden="true" />
          <span>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === "mobileFilters" && (
          <div
            className={`${popoverClass} min-w-[220px]`}
            role="menu"
            aria-label="Filters and sorting"
          >
            <strong className="px-2 text-xs font-semibold text-soc5-muted">
              Status
            </strong>
            {renderStatusOptions()}
            <label className="grid gap-1.5 px-2 pt-2 text-sm font-medium text-soc5-muted">
              Date
              <input
                className="min-h-[34px] rounded-[7px] border border-soc5-line bg-linehaul-surface px-2 text-xs text-soc5-ink"
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  set({
                    dateFrom: event.target.value,
                    dateTo: event.target.value,
                  })
                }
              />
            </label>
            <strong className="px-2 pt-2 text-xs font-semibold text-soc5-muted">
              Sort by
            </strong>
            {renderSortOptions()}
          </div>
        )}
      </div>
      <div className={searchWrapClass}>
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <input
          aria-label="Search"
          placeholder="Search by plate number"
          className={searchInputClass}
          type="text"
          value={filters.search}
          onChange={(event) => set({ search: event.target.value })}
        />
      </div>
      {showColumnSettings && (
        <ColumnVisibilityMenu
          label="Columns"
          options={linehaulColumnOptions}
          visible={visibleColumns}
          onChange={onColumnsChange}
          iconOnly
        />
      )}
      <button
        className={densityToggleClass}
        type="button"
        aria-label={`Use ${density === "compact" ? "comfortable" : "compact"} table density`}
        title={`Switch to ${density === "compact" ? "comfortable" : "compact"} density`}
        aria-pressed={density === "compact"}
        onClick={() =>
          onDensityChange(density === "compact" ? "comfortable" : "compact")
        }
      >
        <Rows3 size={16} aria-hidden="true" />
        <span>{density === "compact" ? "Compact" : "Comfortable"}</span>
      </button>
      <button
        className={`${actionButtonClass} border-soc5-ink bg-soc5-ink text-soc5-panel hover:bg-soc5-muted max-[480px]:w-full`}
        type="button"
        disabled={exporting}
        onClick={onExport}
      >
        <Download size={16} />
        {exporting ? "Exporting" : "Export"}
      </button>
      {showCreateNew && onAddNew && (
        <button
          className={`${actionButtonClass} border-[#2563eb] bg-[#2563eb] text-white hover:bg-blue-700 max-[480px]:col-span-full max-[480px]:w-full`}
          type="button"
          aria-label="Add new linehaul request"
          onClick={onAddNew}
        >
          <Plus size={16} />
          Add new
        </button>
      )}
      {filterChips.length > 0 && (
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5">
          {filterChips}
          <button
            className={clearFiltersClass}
            type="button"
            onClick={clearAllFilters}
          >
            Clear all
          </button>
        </div>
      )}
      {lastUpdated ? (
        <span
          className="basis-full whitespace-nowrap text-right text-xs font-medium leading-none text-soc5-muted"
          aria-live="polite"
        >
          Updated{" "}
          {new Date(lastUpdated).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          {refreshReason ? ` · ${refreshReason}` : ""}
        </span>
      ) : null}
    </div>
  );
}
