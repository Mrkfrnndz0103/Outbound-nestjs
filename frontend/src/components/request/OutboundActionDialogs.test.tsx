import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TruckRequest } from "../../types";

vi.mock("../Modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));

import { OutboundEditDialog } from "./OutboundEditDialog";
import {
  OutboundCancelDialog,
  OutboundRejectDialog,
} from "./OutboundRequestOverlays";

const request = {
  id: "request-1",
  cluster: "North",
  region: "NCR",
  dock_no: "D-1",
  backlogs: 4,
  truck_size: "4WAUV",
  truck_type: "WETLEASE",
} as TruckRequest;
const props = { request, busy: false, onClose: vi.fn(), onSubmit: vi.fn() };

describe("outbound action dialogs", () => {
  for (const [Dialog, name] of [
    [OutboundRejectDialog, "rejection_remarks"],
    [OutboundCancelDialog, "cancellation_remarks"],
  ] as const) {
    it(`requires bounded ${name}`, () => {
      const markup = renderToStaticMarkup(<Dialog {...props} />);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain(`name="${name}"`);
      expect(markup).toMatch(/<textarea[^>]*required=""/);
      expect(markup).toContain('maxLength="2000"');
    });
  }
  it("requires edit remarks for OPS FTE and preserves supported truck sizes", () => {
    const markup = renderToStaticMarkup(
      <OutboundEditDialog {...props} requireRemarks />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toMatch(/<textarea[^>]*name="edit_remarks"[^>]*required=""/);
    expect(markup).toContain('<option selected="">4WAUV</option>');
  });
});
