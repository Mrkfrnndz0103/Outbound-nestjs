import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { requestQueryKey } from "../lib/requestRefresh";
import type { Status, TruckRequest, User } from "../types";

export type QueueSnapshot = {
  status: Status | null;
  rows: TruckRequest[];
  alerts: TruckRequest[];
  count: number;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
  acknowledge: (id: string) => void;
};

export function queueStatusesForRole(role: User["role"]): Status[] {
  switch (role) {
    case "fte_ops":
      return ["PENDING", "REROUTED", "REJECTED"];
    case "fte_mm":
      return ["REQUESTED"];
    case "doc_officer":
      return ["DOCKING"];
    case "ops_pic":
      return ["DOCKING", "DOCKED", "REJECTED"];
  }
}

export function isQueueQueryEnabled(
  preview: boolean,
  role: User["role"],
): boolean {
  return !preview && queueStatusesForRole(role).length > 0;
}

export function actionableQueueRows(role: User["role"], rows: TruckRequest[]) {
  return rows.filter((request) => {
    if (role === "fte_ops") {
      return request.status === "PENDING" || request.status === "REROUTED"
        ? request.next_action_role === undefined ||
            request.next_action_role === "fte_ops"
        : request.status === "REJECTED" &&
            request.next_action_role === "fte_ops";
    }
    if (role === "fte_mm") return request.status === "REQUESTED";
    if (role === "doc_officer")
      return request.status === "DOCKING" && !request.driver_id?.trim();
    if (request.status === "DOCKING") return Boolean(request.driver_id?.trim());
    return (
      request.status === "DOCKED" ||
      (request.status === "REJECTED" && request.next_action_role === "ops_pic")
    );
  });
}

function queueAlertVersion(request: TruckRequest) {
  return `${request.updated_at ?? ""}|${request.status}|${request.driver_id ?? ""}`;
}

export function unacknowledgedQueueRows(
  rows: TruckRequest[],
  acknowledged: ReadonlyMap<string, string>,
) {
  return rows.filter(
    (request) => acknowledged.get(request.id) !== queueAlertVersion(request),
  );
}

export function useQueueNotifications(
  user: User,
  preview = false,
): QueueSnapshot {
  const statuses = queueStatusesForRole(user.role);
  const status = statuses[0] ?? null;
  const [acknowledged, setAcknowledged] = useState<Map<string, string>>(
    () => new Map(),
  );
  const query = useQuery({
    queryKey: [...requestQueryKey("notification-queue"), user.role, statuses],
    queryFn: async () =>
      api<{ data: TruckRequest[]; limit: number }>("/requests/queue?limit=100"),
    enabled: isQueueQueryEnabled(preview, user.role),
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setAcknowledged(new Map());
  }, [user.id, user.role]);

  const rows = actionableQueueRows(user.role, query.data?.data ?? []);
  const alerts = useMemo(
    () => unacknowledgedQueueRows(rows, acknowledged),
    [acknowledged, rows],
  );

  return {
    status,
    rows,
    alerts,
    count: rows.length,
    isPending: status !== null && query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
    acknowledge: (id) => {
      const request = rows.find((row) => row.id === id);
      if (!request) return;
      const version = queueAlertVersion(request);
      setAcknowledged((current) => new Map(current).set(id, version));
    },
  };
}
