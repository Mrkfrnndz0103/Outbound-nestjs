import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../Modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { MidmileActionDialog } from "./MidmileActionDialog";

describe("MidmileActionDialog", () => {
  it("renders the assignment fields for an assign-truck action", () => {
    const markup = renderToStaticMarkup(
      <MidmileActionDialog
        selection={{
          request: {
            id: "request-1",
            cluster: "North Hub",
            status: "REQUESTED",
            truck_size: "6W",
            truck_type: "WETLEASE",
          } as never,
          action: "assign-truck",
        }}
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain("Assign truck");
    expect(markup).toContain('name="plate_number"');
    expect(markup).toContain('name="truck_size"');
  });
});
