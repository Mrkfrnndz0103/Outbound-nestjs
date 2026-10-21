import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TruckRequest } from "../types";
import { formatElapsed, RequestTable } from "./RequestTable";

describe("request elapsed time", () => {
  it("runs until Driver ID assignment and then stops at its timestamp", () => {
    expect(
      formatElapsed(
        "2026-10-05T08:00:00Z",
        null,
        new Date("2026-10-05T09:30:00Z"),
      ),
    ).toBe("1h 30m");
    expect(
      formatElapsed(
        "2026-10-05T08:00:00Z",
        "2026-10-05T08:42:00Z",
        new Date("2026-10-05T09:30:00Z"),
      ),
    ).toBe("42m");
  });
});

it("announces the active sort and exposes full values in the docking table", () => {
  const markup = renderToStaticMarkup(
    <RequestTable
      rows={[
        {
          id: "dock-row",
          status: "DOCKING",
          cluster: "North Hub",
          region: "North",
          dock_no: "D-01",
          backlogs: 4,
          truck_size: "6W",
          truck_type: "WETLEASE",
          created_by: "doc-user",
          created_at: "2026-10-12T00:00:00Z",
          plate_number: "LONG-PLATE-123456789",
        } satisfies TruckRequest,
      ]}
      sort="plate_number"
      direction="desc"
      onSort={() => {}}
    />,
  );
  expect(markup).toContain('aria-sort="descending"');
  expect(markup).toContain('title="LONG-PLATE-123456789"');
  expect(markup).toContain('aria-label="Request records"');
  expect(markup.match(/>Not recorded</g)).toHaveLength(2);
});

it("uses the workflow actor names rather than the request creator", () => {
  const markup = renderToStaticMarkup(
    <RequestTable
      rows={[
        {
          id: "actor-row",
          status: "DOCKED",
          cluster: "North Hub",
          region: "North",
          dock_no: "D-01",
          backlogs: 4,
          truck_size: "6W",
          truck_type: "WETLEASE",
          created_by: "creator-id",
          created_by_name: "Request Creator",
          created_at: "2026-10-12T00:00:00Z",
          mm_fte_id: "mm-id",
          mm_fte_name: "MM Assigner",
          doc_officer_id: "doc-id",
          doc_officer_name: "Driver Assigner",
        },
      ]}
    />,
  );
  expect(markup).toContain("MM Assigner");
  expect(markup).toContain("Driver Assigner");
  expect(markup).not.toContain("Request Creator");
});
