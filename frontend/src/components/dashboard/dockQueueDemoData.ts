import type { DockItem } from "./DockQueueStatus";
import type { TruckRequest } from "../../types";

/**
 * DEMO DATA ONLY. Synthetic rows for layout previews and tests.
 * Not connected to any operational source. Do not render this in production views.
 */
const DOCK_QUEUE_DEMO_DOCKS_HEAD: DockItem[] = [
  {
    id: "demo-dock-01",
    name: "Dock 1",
    status: "Available",
    truckPlate: null,
    detail: "No truck",
  },
  {
    id: "demo-dock-02",
    name: "Dock 2",
    status: "Occupied",
    truckPlate: "WXY 1234",
    detail: "ETA 12 min",
  },
  {
    id: "demo-dock-03",
    name: "Dock 3",
    status: "Occupied",
    truckPlate: "ABC 5678",
    detail: "ETA 28 min",
  },
  {
    id: "demo-dock-04",
    name: "Dock 4",
    status: "Available",
    truckPlate: null,
    detail: "No truck",
  },
  {
    id: "demo-dock-05",
    name: "Dock 5",
    status: "Occupied",
    truckPlate: "DER 9012",
    detail: "ETA 10 min",
  },
  {
    id: "demo-dock-06",
    name: "Dock 6",
    status: "Occupied",
    truckPlate: "GHI 3456",
    detail: "ETA 25 min",
  },
  {
    id: "demo-dock-07",
    name: "Dock 7",
    status: "Available",
    truckPlate: null,
    detail: "No truck",
  },
  {
    id: "demo-dock-08",
    name: "Dock 8",
    status: "Docking",
    truckPlate: null,
    detail: "Until 14:00",
  },
];

export const DOCK_QUEUE_LOCATIONS = [
  ...Array.from({ length: 73 }, (_, index) => `Dock ${index + 1}`),
  ...Array.from({ length: 7 }, (_, index) => `DAC ${index + 1}`),
] as const;

export const DOCK_QUEUE_DEMO_DOCKS: DockItem[] = [
  ...DOCK_QUEUE_DEMO_DOCKS_HEAD,
  ...DOCK_QUEUE_LOCATIONS.slice(DOCK_QUEUE_DEMO_DOCKS_HEAD.length).map(
    (name) => ({
      id: `demo-${name.toLowerCase().replaceAll(" ", "-")}`,
      name,
      status: "Available" as const,
      truckPlate: null,
      detail: "No truck",
    }),
  ),
];

function normalizeDockName(value: string | null | undefined) {
  const match = value?.trim().match(/^(dock|dac)\s*0*(\d+)$/i);
  return match ? `${match[1].toUpperCase()} ${Number(match[2])}` : null;
}

/** Derives physical dock occupancy from the request status read model. */
export function dockItemsFromRequests(
  requests: Pick<TruckRequest, "dock_no" | "plate_number" | "status">[],
  locations: readonly string[] = DOCK_QUEUE_LOCATIONS,
): DockItem[] {
  return locations.map((name) => {
    const request = requests.find(
      (candidate) =>
        normalizeDockName(candidate.dock_no) === name.toUpperCase(),
    );
    const status: DockItem["status"] =
      request?.status === "DOCKED"
        ? "Occupied"
        : request?.status === "ASSIGNED" || request?.status === "DOCKING"
          ? "Docking"
          : "Available";
    const active = status !== "Available";

    return {
      id: `dock-${name.toLowerCase().replaceAll(" ", "-")}`,
      name,
      status,
      truckPlate: active ? (request?.plate_number ?? null) : null,
      detail: active
        ? status === "Occupied"
          ? "Docked"
          : "Awaiting dock"
        : "No truck",
    };
  });
}
