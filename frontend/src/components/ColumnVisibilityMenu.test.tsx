import { describe, expect, it } from "vitest";
import { linehaulPrimaryColumnKeysForRole } from "./ColumnVisibilityMenu";

describe("role-based linehaul table presets", () => {
  it("keeps operational columns for FTE Ops and emphasizes assignment fields for MM", () => {
    expect(linehaulPrimaryColumnKeysForRole("fte_ops")).toContain("linehaulTrip");
    expect(linehaulPrimaryColumnKeysForRole("fte_mm")).toContain("provideTime");
    expect(linehaulPrimaryColumnKeysForRole("fte_mm")).toContain("lhTypeInput");
  });
});
