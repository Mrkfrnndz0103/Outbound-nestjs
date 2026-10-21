import { describe, expect, it } from "vitest";
import { buildIdempotencyHeaders, generateIdempotencyKey } from "./idempotency";

describe("idempotency keys", () => {
  it("stays stable for the same logical mutation", () => {
    const first = generateIdempotencyKey("outbound-create", {
      cluster: "DLX",
      dock_no: "D-12",
      backlogs: 3,
    });
    const second = generateIdempotencyKey("outbound-create", {
      dock_no: "D-12",
      cluster: "DLX",
      backlogs: 3,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^outbound-create:/);
  });

  it("builds a header payload for fetch requests", () => {
    const headers = buildIdempotencyHeaders("midmile-assign", {
      requestId: "abc-123",
      payload: { driver_id: "d-1" },
    });

    expect(headers["Idempotency-Key"]).toBe(
      generateIdempotencyKey("midmile-assign", {
        requestId: "abc-123",
        payload: { driver_id: "d-1" },
      }),
    );
  });

  it("keeps retry keys stable while giving a later approval cycle a fresh key", () => {
    const ids = ["a", "b", "c"];
    const firstCycle = { ids, operationId: "approval-cycle-1" };
    const retry = { ids, operationId: "approval-cycle-1" };
    const laterCycle = { ids, operationId: "approval-cycle-2" };

    expect(generateIdempotencyKey("outbound-bulk-approve", firstCycle)).toBe(
      generateIdempotencyKey("outbound-bulk-approve", retry),
    );
    expect(
      generateIdempotencyKey("outbound-bulk-approve", firstCycle),
    ).not.toBe(generateIdempotencyKey("outbound-bulk-approve", laterCycle));
  });
});
