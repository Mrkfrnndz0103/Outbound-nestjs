import { describe, expect, it } from "vitest";
import type { TruckRequest } from "../types";
import {
  actionableQueueRows,
  isQueueQueryEnabled,
  queueStatusesForRole,
  unacknowledgedQueueRows,
} from "./useQueueNotifications";

function request(overrides: Partial<TruckRequest> = {}): TruckRequest {
  return {
    id: "request-1",
    status: "PENDING",
    cluster: "North Hub",
    region: "North",
    dock_no: "D-01",
    backlogs: 4,
    truck_size: "6W",
    truck_type: "WETLEASE",
    created_by: "ops-pic",
    created_at: "2026-10-12T00:00:00Z",
    ...overrides,
  };
}

describe("role request notification queues", () => {
  it("does not enable the protected queue query in preview mode", () => {
    expect(isQueueQueryEnabled(true, "ops_pic")).toBe(false);
    expect(isQueueQueryEnabled(false, "ops_pic")).toBe(true);
  });

  it("loads REQUESTED work for FTE MM and only unassigned DOCKING work for DOC", () => {
    expect(queueStatusesForRole("fte_ops")).toEqual([
      "PENDING",
      "REROUTED",
      "REJECTED",
    ]);
    expect(queueStatusesForRole("fte_mm")).toEqual(["REQUESTED"]);
    expect(queueStatusesForRole("doc_officer")).toEqual(["DOCKING"]);
    expect(
      actionableQueueRows("doc_officer", [
        request({ status: "DOCKING", driver_id: null }),
        request({ id: "assigned", status: "DOCKING", driver_id: "123" }),
      ]).map(({ id }) => id),
    ).toEqual(["request-1"]);
  });

  it("routes rejected work to the recorded next role", () => {
    const rejected = request({
      status: "REJECTED",
      next_action_role: "fte_ops",
    });
    expect(actionableQueueRows("fte_ops", [rejected])).toEqual([rejected]);
    expect(actionableQueueRows("ops_pic", [rejected])).toEqual([]);
    expect(
      actionableQueueRows("ops_pic", [
        { ...rejected, next_action_role: "ops_pic" },
      ]),
    ).toHaveLength(1);
  });

  it("keeps an acknowledgment for the current version and re-alerts after an update", () => {
    const first = request({
      status: "DOCKED",
      updated_at: "2026-10-12T08:00:00Z",
    });
    const acknowledged = new Map([[first.id, "2026-10-12T08:00:00Z|DOCKED|"]]);
    expect(unacknowledgedQueueRows([first], acknowledged)).toEqual([]);

    const updated = { ...first, updated_at: "2026-10-12T08:05:00Z" };
    expect(unacknowledgedQueueRows([updated], acknowledged)).toEqual([updated]);
  });
});
