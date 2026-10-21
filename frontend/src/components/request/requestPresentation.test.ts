import { describe, expect, it } from "vitest";
import type { TruckRequest } from "../../types";
import {
  canEditDockedRequest,
  displayRequestActor,
} from "./requestPresentation";

describe("workflow actor presentation", () => {
  it("prefers the recorded actor name and falls back to the recorded actor ID", () => {
    expect(displayRequestActor("MM Assigner", "mm-id")).toBe("MM Assigner");
    expect(displayRequestActor(null, "doc-id")).toBe("doc-id");
  });
  it("does not invent attribution when historical metadata is missing or blank", () => {
    expect(displayRequestActor(undefined, undefined)).toBe("Not recorded");
    expect(displayRequestActor("  ", " ")).toBe("Not recorded");
  });
});

describe("post-docked request edit eligibility", () => {
  const request: Pick<TruckRequest, "status" | "created_by"> = {
    status: "DOCKED",
    created_by: "pic-1",
  };

  it("allows only the owning OPS PIC to edit a DOCKED request", () => {
    expect(canEditDockedRequest("ops_pic", "pic-1", request)).toBe(true);
    expect(canEditDockedRequest("ops_pic", "pic-2", request)).toBe(false);
    expect(canEditDockedRequest("fte_ops", "pic-1", request)).toBe(false);
    expect(
      canEditDockedRequest("ops_pic", "pic-1", {
        ...request,
        status: "DOCKING",
      }),
    ).toBe(false);
  });
});
