import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type DockItem, DockQueueStatus } from "./DockQueueStatus";
import { DOCK_QUEUE_DEMO_DOCKS } from "./dockQueueDemoData";
import { dockItemsFromRequests } from "./dockQueueDemoData";

const render = (props: Partial<Parameters<typeof DockQueueStatus>[0]> = {}) =>
  renderToStaticMarkup(
    <DockQueueStatus docks={DOCK_QUEUE_DEMO_DOCKS} source="demo" {...props} />,
  );

describe("DockQueueStatus", () => {
  it("derives occupancy from docking request statuses", () => {
    const docks = dockItemsFromRequests([
      { dock_no: "Dock 2", plate_number: "WXY 1234", status: "DOCKING" },
      { dock_no: "Dock 3", plate_number: "ABC 5678", status: "DOCKED" },
      { dock_no: "Dock 4", plate_number: "IGNORED", status: "ASSIGNED" },
    ]);

    expect(docks[0]).toMatchObject({ status: "Available", truckPlate: null });
    expect(docks[1]).toMatchObject({
      status: "Docking",
      truckPlate: "WXY 1234",
    });
    expect(docks[2]).toMatchObject({ status: "Occupied", detail: "Docked" });
    expect(docks[3]).toMatchObject({
      status: "Docking",
      truckPlate: "IGNORED",
    });
    expect(docks[4]).toMatchObject({ status: "Available", truckPlate: null });
  });

  it("labels the section with its heading and uses token-backed panel classes", () => {
    const markup = render();

    expect(markup).toContain("dock-panel");
    expect(markup).toContain("border-card-line");
    expect(markup).toContain("bg-card-surface");
    expect(markup).toContain("shadow-card");
    const headingId = markup.match(
      /<section[^>]*aria-labelledby="([^"]+)"/,
    )?.[1];
    expect(headingId).toBeTruthy();
    expect(markup).toContain(`id="${headingId}"`);
    expect(markup).toContain("Dock &amp; Queue Status</span></h2>");
  });

  it("renders one card per dock keyed by stable id with status text, not color alone", () => {
    const markup = render();

    for (const dock of DOCK_QUEUE_DEMO_DOCKS) {
      expect(markup).toContain(`data-dock-status="${dock.status}"`);
      expect(markup).toContain(`>${dock.name}</h3>`);
    }
    expect(markup.match(/data-dock-status=/g)).toHaveLength(
      DOCK_QUEUE_DEMO_DOCKS.length,
    );
    expect(markup).toContain('<span class="min-w-0 truncate">Available</span>');
    expect(markup).toContain('<span class="min-w-0 truncate">Occupied</span>');
    expect(markup).toContain('<span class="min-w-0 truncate">Docking</span>');
  });

  it("shows an em dash when no truck plate is assigned and omits absent details", () => {
    const docks: DockItem[] = [
      { id: "a", name: "Dock A", status: "Available", truckPlate: null },
    ];
    const markup = render({ docks });

    expect(markup).toContain(">—</span>");
    expect(markup).not.toContain('title="undefined"');
    expect(markup).not.toContain("text-[9px] leading-tight text-soc5-muted");
  });

  it("marks decorative icons as hidden from assistive technology", () => {
    const markup = render({
      docks: [
        { id: "a", name: "Dock A", status: "Occupied", truckPlate: "X1" },
      ],
    });

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/<svg(?![^>]*aria-hidden)/);
  });

  it("uses a horizontally scrollable rail for the complete dock list", () => {
    const markup = render();

    expect(DOCK_QUEUE_DEMO_DOCKS).toHaveLength(80);
    expect(markup).toContain("auto-cols-[110px]");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain('aria-label="Docks"');
    expect(markup).toContain('tabindex="0"');
  });

  it("renders a polite loading state and no dock cards while loading with no data", () => {
    const markup = render({ docks: null, isLoading: true });

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading dock status.");
    expect(markup).not.toContain("data-dock-status");
  });

  it("renders errors as alerts without substituting dock rows", () => {
    const markup = render({ docks: null, error: "Dock feed failed to load." });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Dock feed failed to load.");
    expect(markup).not.toContain("data-dock-status");
  });

  it("renders the empty state when a connected source reports no docks", () => {
    const markup = render({
      docks: [],
      emptyMessage: "No docks reported for this shift.",
    });

    expect(markup).toContain("No docks reported for this shift.");
    expect(markup).not.toContain("data-dock-status");
  });

  it("renders the unavailable state when no live dock source is connected", () => {
    const markup = render({ docks: null, source: "live" });

    expect(markup).toContain("Dock status feed is not connected.");
    expect(markup).toContain("Dock occupancy data is not available yet.");
    expect(markup).not.toContain("data-dock-status");
  });

  it("describes live and demo data accurately and only mentions requests for live data", () => {
    const live = render({ source: "live" });
    const demo = render({ source: "demo" });

    expect(live).toContain(
      "Live dock availability with trucks from active requests.",
    );
    expect(demo).toContain("Demo layout for preview only. Not live dock data.");
    expect(demo).not.toContain("request");
  });

  it("shows the last-updated time with a machine-readable datetime", () => {
    const lastUpdated = new Date("2026-10-21T02:30:00.000Z");
    const markup = render({ lastUpdated });

    expect(markup).toContain(`dateTime="${lastUpdated.toISOString()}"`);
    expect(markup).toContain("Last updated");
  });
});
