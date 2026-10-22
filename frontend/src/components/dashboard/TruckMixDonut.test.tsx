import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TruckMixDonut } from "./TruckMixDonut";

describe("TruckMixDonut", () => {
  it("labels each non-empty segment with its count and share", () => {
    const markup = renderToStaticMarkup(
      <TruckMixDonut
        segments={[
          { label: "4W", value: 2, color: "#111111" },
          { label: "6W", value: 2, color: "#222222" },
          { label: "10W", value: 0, color: "#333333" },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Truck mix: 4W 2 (50%), 6W 2 (50%)"');
    expect(markup).toContain(">4W (2)</text>");
    expect(markup).toContain(">6W (2)</text>");
    expect(markup).not.toContain(">10W");
    expect(markup).toContain(">50%</text>");
    expect(markup).toContain(">4</text>");
    expect(markup).toContain(">Total</text>");
  });

  it("uses each segment color for its ring arc", () => {
    const markup = renderToStaticMarkup(
      <TruckMixDonut
        segments={[
          { label: "4W", value: 3, color: "#1d5c58" },
          { label: "6W", value: 1, color: "#d3e9e5" },
        ]}
      />,
    );

    expect(markup).toContain('stroke="#1d5c58"');
    expect(markup).toContain('stroke="#d3e9e5"');
    expect(markup).not.toContain("undefined");
  });

  it("renders an empty ring with no labels when there are no trucks", () => {
    const markup = renderToStaticMarkup(
      <TruckMixDonut
        segments={[{ label: "4W", value: 0, color: "#1d5c58" }]}
      />,
    );

    expect(markup).toContain(
      'aria-label="Truck mix: no trucks in the selected date range"',
    );
    expect(markup).not.toContain('stroke="#1d5c58"');
    expect(markup).not.toContain("%</text>");
    expect(markup).toContain(">0</text>");
  });
});
