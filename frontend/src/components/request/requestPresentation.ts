import type { Role, TruckRequest } from "../../types";

export function formatRequestDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function displayRequestValue(value?: string | null) {
  return value?.trim() ? value : "-";
}

export function formatRequestDetailDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function formatRequestCluster(value: string) {
  return value
    .split(",")
    .map((cluster) => cluster.trim())
    .filter(Boolean)
    .join(" · ");
}

export function displayRequestActor(name?: string | null, id?: string | null) {
  return name?.trim() || id?.trim() || "Not recorded";
}

export function canEditDockedRequest(
  role: Role,
  actorId: string,
  request: Pick<TruckRequest, "status" | "created_by">,
) {
  return role === "ops_pic"
    && actorId === request.created_by
    && request.status === "DOCKED";
}
