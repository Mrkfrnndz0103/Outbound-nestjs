import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../Modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { DockDialog } from "./DockDialog";

describe("DockDialog", () => {
  it("renders the driver assignment contract for document officers", () => {
    const markup = renderToStaticMarkup(
      <DockDialog
        request={
          {
            id: "request-1",
            cluster: "North Hub",
            status: "DOCKING",
            driver_id: null,
          } as never
        }
        actorRole="doc_officer"
        action="mark-docked"
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain("Assign Driver ID");
    expect(markup).toContain('name="driver_id"');
  });
});
