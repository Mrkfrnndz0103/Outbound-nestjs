import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QueueSnapshot } from "../hooks/useQueueNotifications";
import type { TruckRequest, User } from "../types";

const { request, filters } = vi.hoisted(() => ({
  request: {
    id: "table-request",
    status: "PENDING",
    approval_status: "PENDING",
    cluster: "North Hub",
    region: "North",
    dock_no: "D-01",
    backlogs: 4,
    truck_size: "6W",
    truck_type: "WETLEASE",
    created_by: "operator",
    created_at: "2026-10-12T00:00:00Z",
    driver_assigned_at: "2026-10-12T09:42:00",
  } as TruckRequest,
  filters: {
    status: "ALL",
    search: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    perPage: 20,
    sort: "cluster",
    direction: "desc",
  },
}));
vi.mock("../hooks/useLinehaulTablePreferences", () => ({
  useLinehaulTablePreferences: () => ({
    visibleColumns: ["cluster", "assignedTime", "mmFte", "docOfficer"],
    density: "comfortable",
    updateColumns: vi.fn(),
    setDensity: vi.fn(),
  }),
}));
vi.mock("../hooks/useRequestFilters", () => ({
  useRequestFilters: () => ({
    filters,
    appliedFilters: filters,
    setFilters: vi.fn(),
    changeFilters: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      data: [{ ...request, status: "REQUESTED" }],
      current_page: 1,
      last_page: 1,
      total: 1,
    },
    isPending: false,
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("../hooks/useOutboundRequests", () => ({
  useOutboundRequests: () => ({
    filters,
    rows: [request],
    requests: {
      data: { data: [request], current_page: 1, last_page: 1, total: 1 },
      isPending: false,
    },
    approveRequests: { isPending: false, mutate: vi.fn() },
    createRequest: {},
    updateRequest: {},
    rejectRequest: {},
    sortBy: vi.fn(),
    changeFilters: vi.fn(),
    showToast: vi.fn(),
    refreshManually: vi.fn(),
  }),
}));

import { MidmileRequests } from "./MidmileRequests";
import { OutboundRequests } from "./OutboundRequests";

const queue = { alerts: [], acknowledge: vi.fn() } as unknown as QueueSnapshot;
const user = (role: User["role"]): User => ({
  id: "operator",
  name: "Operator",
  role,
  is_admin: false,
});

describe("request tables with the Status column hidden", () => {
  for (const role of ["ops_pic", "fte_ops"] as const) {
    it(`${role} retains expansion and only permitted selection controls`, () => {
      const markup = renderToStaticMarkup(
        <OutboundRequests user={user(role)} queue={queue} />,
      );
      expect(markup).toContain("<table");
      expect(markup).toContain(
        'aria-label="Expand details for request table-request"',
      );
      expect(markup.includes('aria-label="Select request table-request"')).toBe(
        role === "fte_ops",
      );
      expect(markup).toContain('aria-sort="descending"');
      expect(markup).toMatch(/Assigned time/);
      expect(markup).toContain("9:42:00 AM");
      expect(markup.match(/>Not recorded</g)).toHaveLength(2);
    });
  }
  it("FTE MM retains expansion and assignment selection controls", () => {
    const markup = renderToStaticMarkup(
      <MidmileRequests user={user("fte_mm")} queue={queue} />,
    );
    expect(markup).toContain("<table");
    expect(markup).toContain(
      'aria-label="Expand details for request table-request"',
    );
    expect(markup).toContain('aria-label="Select request table-request"');
    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain("9:42:00 AM");
    expect(markup.match(/>Not recorded</g)).toHaveLength(2);
  });
});
