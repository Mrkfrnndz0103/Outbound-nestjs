import { describe, expect, it } from "vitest";
import {
  nextActionLabelFor,
  statusLabelFor,
  workflowActionPath,
} from "./workflow";

describe("workflow presentation and commands", () => {
  it("uses one label source for status text", () => {
    expect(statusLabelFor("REROUTED")).toBe("Rerouted");
    expect(statusLabelFor("FOR_DOCKING")).toBe("Docking");
  });

  it("builds the canonical request action path", () => {
    expect(workflowActionPath("request-1", "assign-truck")).toBe(
      "/requests/request-1/assign-truck",
    );
  });

  it("names the responsible next action clearly", () => {
    expect(nextActionLabelFor("doc_officer")).toBe(
      "DOC Officer: assign driver",
    );
    expect(nextActionLabelFor(null)).toBe("No action pending");
  });
});
