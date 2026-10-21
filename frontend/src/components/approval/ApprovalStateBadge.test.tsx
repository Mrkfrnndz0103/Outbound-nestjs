import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalStateBadge, approvalStateFor } from "./ApprovalStateBadge";

describe("ApprovalStateBadge", () => {
  it("shows rerouting while a request is being reassigned", () => {
    expect(approvalStateFor("REROUTED", "PENDING")).toBe("routing");
    expect(
      renderToStaticMarkup(
        <ApprovalStateBadge status="REROUTED" approvalStatus="PENDING" />,
      ),
    ).toContain("Rerouting");
  });

  it.each([
    ["APPROVED", "Approved"],
    ["REJECTED", "Rejected"],
    ["CANCELLED", "Cancelled"],
  ] as const)("renders backend approval status %s", (approvalStatus, label) => {
    const markup = renderToStaticMarkup(
      <ApprovalStateBadge status="PENDING" approvalStatus={approvalStatus} />,
    );
    expect(markup).toContain(label);
  });
});
