import type { RequestFilters } from "../types";

export const REQUESTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Po3LyyOAJ8Q-EbX_807RSxrA_grwmsdlsPPP4FFFBig/edit?gid=0#gid=0";

export function openRequestsSheet() {
  window.open(REQUESTS_SHEET_URL, "_blank", "noopener,noreferrer");
}

export const defaultRequestFilters: RequestFilters = {
  status: "ALL",
  search: "",
  dateFrom: "",
  dateTo: "",
  sort: "created_at",
  direction: "desc",
  page: 1,
  perPage: 20,
};

export function syncRequestSearch(
  filters: RequestFilters,
  search: string,
): RequestFilters {
  if (filters.search === search) return filters;
  return { ...filters, search, page: 1 };
}

export type RequestPayload = {
  cluster: FormDataEntryValue | null;
  region: FormDataEntryValue | null;
  dock_no: FormDataEntryValue | null;
  backlogs: number;
  backlogs_timestamp?: FormDataEntryValue | null;
  truck_size: FormDataEntryValue | null;
  truck_type: "WETLEASE" | "DRYLEASE";
  edit_remarks?: string;
};

export function buildMidmileAssignmentPayload(
  data: FormData,
  now: Date = new Date(),
) {
  return {
    plate_number: data.get("plate_number"),
    truck_size: data.get("truck_size"),
    truck_type: data.get("truck_type"),
    provide_time: now.toISOString(),
  };
}

export function buildRequestPayload(data: FormData): RequestPayload {
  return {
    cluster: data.get("cluster"),
    region: data.get("region"),
    dock_no: data.get("dock_no"),
    backlogs: Number(data.get("backlogs")),
    backlogs_timestamp: data.get("backlogs_timestamp"),
    truck_size: data.get("truck_size"),
    truck_type: data.get("truck_type") === "DRYLEASE" ? "DRYLEASE" : "WETLEASE",
    ...(data.has("edit_remarks") ? { edit_remarks: String(data.get("edit_remarks") ?? "").trim() } : {}),
  };
}

export function requestQueryString(
  filters: RequestFilters,
  overrides: Partial<RequestFilters> = {},
) {
  const value = { ...filters, ...overrides };
  const params = new URLSearchParams({
    page: String(value.page),
    per_page: String(value.perPage),
    sort: value.sort,
    direction: value.direction,
  });
  if (value.status !== "ALL") params.set("status", value.status);
  if (value.search.trim()) params.set("search", value.search.trim());
  if (value.dateFrom) params.set("date_from", value.dateFrom);
  if (value.dateTo) params.set("date_to", value.dateTo);
  return params.toString();
}

export function requestMetricsQueryString(
  filters: Pick<RequestFilters, "search" | "dateFrom" | "dateTo">,
) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  return params.toString();
}
