import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequestDecisionRemarks } from "./RequestDecisionRemarks";

describe("request decision remarks", () => {
  it("shows rejection and cancellation as separate saved reasons", () => {
    const markup = renderToStaticMarkup(
      <RequestDecisionRemarks
        rejectionRemarks="Correct dock"
        cancellationRemarks="Duplicate"
      />,
    );
    expect(markup).toContain('aria-label="Rejection remarks"');
    expect(markup).toContain("Correct dock");
    expect(markup).toContain('aria-label="Cancellation remarks"');
    expect(markup).toContain("Duplicate");
  });
  it("omits empty reasons", () => {
    expect(
      renderToStaticMarkup(<RequestDecisionRemarks rejectionRemarks="  " />),
    ).toBe("");
  });
});
