import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import type { TruckRequest, User } from "../types";

const { queue } = vi.hoisted(() => ({
  queue: {
    data: undefined as { data: TruckRequest[]; limit: number } | undefined,
    isPending: false,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queue,
  useMutation: () => ({ error: null, isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import {
  canShowDriverAssignment,
  canShowTripAssignment,
  DockingConfirmation,
} from "./DockingConfirmation";

const user: User = {
  id: "doc-user",
  name: "Document officer",
  role: "doc_officer",
  is_admin: false,
};
const queueAlerts = {
  alerts: [],
  acknowledge: vi.fn(),
} as unknown as QueueSnapshot;

beforeEach(() => {
  queue.data = undefined;
  queue.isPending = false;
  queue.isFetching = false;
  queue.error = null;
});

describe("docking queue feedback", () => {
  it("shows a retryable error instead of an empty queue when the initial fetch fails", () => {
    queue.error = new Error("Network unavailable");
    const markup = renderToStaticMarkup(
      <DockingConfirmation user={user} queue={queueAlerts} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Unable to load the docking queue");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("No trucks are waiting for docking.");
  });

  it("retains loaded records and warns that they may be outdated after refresh fails", () => {
    queue.data = {
      data: [
        {
          id: "dock-request",
          status: "DOCKING",
          cluster: "North Hub",
          dock_no: "D-01",
          backlogs: 4,
          request_timestamp: "2026-10-12T00:00:00Z",
        } as TruckRequest,
      ],
      limit: 100,
    };
    queue.error = new Error("Network unavailable");
    const markup = renderToStaticMarkup(
      <DockingConfirmation user={user} queue={queueAlerts} />,
    );

    expect(markup).toContain("North Hub");
    expect(markup).toContain("may be outdated");
    expect(markup).toContain("Retry");
  });

  it("only shows the empty queue message after a successful empty response", () => {
    queue.data = {
      data: [],
      limit: 100,
    };
    const markup = renderToStaticMarkup(
      <DockingConfirmation user={user} queue={queueAlerts} />,
    );

    expect(markup).toContain("No trucks are waiting for docking.");
    expect(markup).not.toContain('role="alert"');
  });

  it("disables Retry and announces progress while retrying", () => {
    queue.error = new Error("Network unavailable");
    queue.isFetching = true;
    const markup = renderToStaticMarkup(
      <DockingConfirmation user={user} queue={queueAlerts} />,
    );

    expect(markup).toContain("Retrying");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
  });
});

describe("docking workflow gates", () => {
  it("only reveals the Doc Officer assignment after the docking checkbox", () => {
    expect(
      canShowDriverAssignment({ status: "DOCKING", driver_id: null }, false),
    ).toBe(false);
    expect(
      canShowDriverAssignment({ status: "DOCKING", driver_id: null }, true),
    ).toBe(true);
  });

  it("only reveals the Ops PIC trip action after Driver ID is present", () => {
    expect(
      canShowTripAssignment({ status: "DOCKING", driver_id: null }, "ops_pic"),
    ).toBe(false);
    expect(
      canShowTripAssignment(
        { status: "DOCKING", driver_id: "DRV-1" },
        "ops_pic",
      ),
    ).toBe(true);
  });
});
