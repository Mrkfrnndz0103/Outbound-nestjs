import { api } from "./api";
import type { TruckRequest } from "../types";

export type RequestQueuePage = {
  data: TruckRequest[];
  has_more: boolean;
  next_cursor: string | null;
  limit: number;
};

export function fetchRequestQueuePage(cursor = "", signal?: AbortSignal) {
  return api<RequestQueuePage>(`/requests/queue?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
}
