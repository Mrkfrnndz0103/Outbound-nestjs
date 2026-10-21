import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequestCancellationRemarks } from "./RequestCancellationRemarks";

describe("request cancellation remarks", () => {
  it("shows saved cancellation remarks to request viewers", () => {
    const markup = renderToStaticMarkup(
      <RequestCancellationRemarks remarks="Duplicate request" />,
    );

    expect(markup).toContain("Cancellation remarks");
    expect(markup).toContain("Duplicate request");
  });

  it("does not render an empty cancellation note", () => {
    expect(
      renderToStaticMarkup(<RequestCancellationRemarks remarks="  " />),
    ).toBe("");
  });
});
