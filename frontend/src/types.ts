export type Role = "ops_pic" | "fte_ops" | "fte_mm" | "doc_officer";
export type Status =
  | "PENDING"
  | "REQUESTED"
  | "CANCELLED"
  | "REJECTED"
  | "REROUTED"
  | "ASSIGNED"
  | "DOCKING"
  | "DOCKED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface User {
  id: string;
  name: string;
  role: Role;
  original_role?: Role;
  is_admin?: boolean;
  email?: string;
  ops_id?: string;
  must_change_password?: boolean;
  is_active?: boolean;
  password_changed_at?: string | null;
}
export interface TruckRequest {
  id: string;
  request_timestamp?: string;
  cluster: string;
  region: string;
  dock_no: string;
  backlogs: number;
  backlogs_timestamp?: string | null;
  ob_fte?: string | null;
  ob_fte_name?: string | null;
  truck_size: string;
  truck_type: string;
  plate_number?: string | null;
  provide_time?: string | null;
  linehaul_trip_no?: string | null;
  linehaul_trip_at?: string | null;
  docked_time?: string | null;
  status: Status;
  display_status?: Status;
  next_action_role?: Role | null;
  rejection_return_role?: Role | null;
  approval_status?: ApprovalStatus | null;
  approval_source?: "WEB" | "SEATALK" | null;
  rejection_remarks?: string | null;
  cancellation_remarks?: string | null;
  driver_id?: string | null;
  driver_assigned_at?: string | null;
  created_by: string;
  created_by_name?: string | null;
  mm_fte_id?: string | null;
  mm_fte_name?: string | null;
  doc_officer_id?: string | null;
  doc_officer_name?: string | null;
  created_at: string;
  updated_at?: string;
}
export interface ClusterLookup {
  id: string;
  cluster_name: string;
  hub_name: string;
  region: string;
  dock_number?: string | null;
  backlogs?: number | null;
  backlogs_ts?: string | null;
}
export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  from?: number | null;
  to?: number | null;
  total: number;
}

export interface RequestMetrics {
  total: number;
  awaiting_action: number;
  by_status: Partial<Record<Status, number>>;
}
export interface RequestAnalytics {
  truck_sizes: Partial<
    Record<"4W" | "4WAUV" | "4WCV" | "6W" | "10W" | "6WF", number>
  >;
  hourly: Array<{ label: string; count: number }>;
  shift_start: string;
  average_dwell_minutes?: number | null;
  average_waiting_minutes?: number | null;
}

export interface RequestDashboardSummary {
  metrics: RequestMetrics;
  analytics: RequestAnalytics;
}

export type AppView =
  | "overview"
  | "lh-request"
  | "truck-request"
  | "docking"
  | "kpi"
  | "users";
export interface Notification {
  id: number;
  request_id: string | null;
  event_type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}
export interface ManagedUser {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
  ops_id?: string | null;
  is_active: boolean;
  created_at: string;
}
export type RequestSort =
  | "created_at"
  | "request_timestamp"
  | "cluster"
  | "dock_no"
  | "backlogs"
  | "plate_number"
  | "status";
export type SortDirection = "asc" | "desc";
export interface RequestFilters {
  status: Status | "ALL";
  search: string;
  dateFrom: string;
  dateTo: string;
  sort: RequestSort;
  direction: SortDirection;
  page: number;
  perPage: number;
}
