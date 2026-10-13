import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { buildIdempotencyHeaders } from "../lib/idempotency";
import {
  REQUEST_REALTIME_REFRESH_EVENT,
  requestQueryKey,
  type RequestRefreshReason,
} from "../lib/requestRefresh";
import { workflowActionPath } from "../lib/workflow";
import { requestQueryString, type RequestPayload } from "../lib/requests";
import { useRequestFilters } from "./useRequestFilters";
import type { Page, RequestSort, TruckRequest } from "../types";

export function useOutboundRequests() {
  const queryClient = useQueryClient();
  const { filters, appliedFilters, setFilters, changeFilters, updateSearch } =
    useRequestFilters();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TruckRequest | null>(null);
  const [toast, setToast] = useState("");
  const pendingRefreshReason = useRef<RequestRefreshReason | null>(null);
  const [lastRefreshReason, setLastRefreshReason] =
    useState<RequestRefreshReason>("initial");
  const requests = useQuery({
    queryKey: [...requestQueryKey("outbound-all"), appliedFilters],
    queryFn: () =>
      api<Page<TruckRequest>>(
        `/requests?${requestQueryString(appliedFilters)}`,
      ),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchInterval: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!requests.dataUpdatedAt) return;
    setLastRefreshReason(pendingRefreshReason.current ?? "initial");
    pendingRefreshReason.current = null;
  }, [requests.dataUpdatedAt]);
  useEffect(() => {
    const markRealtimeRefresh = () => {
      pendingRefreshReason.current = "realtime";
    };
    window.addEventListener(REQUEST_REALTIME_REFRESH_EVENT, markRealtimeRefresh);

    return () =>
      window.removeEventListener(
        REQUEST_REALTIME_REFRESH_EVENT,
        markRealtimeRefresh,
      );
  }, []);
  const rows = useMemo(() => requests.data?.data ?? [], [requests.data]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  async function refreshData(message: string) {
    showToast(message);
    pendingRefreshReason.current = "mutation";
    await queryClient.invalidateQueries({ queryKey: requestQueryKey("outbound-all") });
  }

  function refreshManually() {
    pendingRefreshReason.current = "manual";
    void requests.refetch();
  }

  const createRequest = useMutation({
    mutationFn: (payload: RequestPayload) =>
      api<TruckRequest>("/requests", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: buildIdempotencyHeaders("outbound-create", payload),
      }),
    onSuccess: async () => {
      setCreating(false);
      await refreshData("LH request created.");
    },
  });
  const updateRequest = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RequestPayload }) =>
      api<TruckRequest>(`/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: buildIdempotencyHeaders("outbound-update", { id, payload }),
      }),
    onSuccess: async () => {
      setEditing(null);
      await refreshData("LH request updated.");
    },
  });
  const approveRequests = useMutation({
    mutationFn: async ({ ids, operationId }: { ids: string[]; operationId: string }) => {
      if (ids.length > 2) {
        return api<{ data: TruckRequest[] }>("/requests/bulk-approve", {
          method: "POST",
          body: JSON.stringify({ ids }),
          headers: buildIdempotencyHeaders("outbound-bulk-approve", { ids, operationId }),
        });
      }

      return Promise.all(
        ids.map((id) =>
          api<TruckRequest>(workflowActionPath(id, "approve"), {
            method: "POST",
            body: JSON.stringify({}),
            headers: buildIdempotencyHeaders("outbound-approve", { id }),
          }),
        ),
      );
    },
    onSuccess: async (_, { ids }) => {
      await refreshData(
        ids.length > 2
          ? `${ids.length} LH requests bulk approved.`
          : `${ids.length} LH request${ids.length === 1 ? "" : "s"} approved.`,
      );
    },
  });
  const rejectRequest = useMutation({
    mutationFn: ({ id, rejection_remarks }: { id: string; rejection_remarks: string }) =>
      api<TruckRequest>(workflowActionPath(id, "reject-ops"), {
        method: "POST",
        body: JSON.stringify({ rejection_remarks }),
        headers: buildIdempotencyHeaders("outbound-reject", { id, rejection_remarks }),
      }),
    onSuccess: async () => {
      await refreshData("LH request rejected.");
    },
  });

  function sortBy(sort: RequestSort) {
    setFilters((current) => ({
      ...current,
      sort,
      direction:
        current.sort === sort && current.direction === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }

  return {
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
    updateSearch,
    sortBy,
    refreshManually,
    lastRefreshReason,
    dataUpdatedAt: requests.dataUpdatedAt,
  };
}
