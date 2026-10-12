import { expect, test, type Page } from "@playwright/test";
import { mockShellSession } from "./helpers/shell-session";

async function openVerification(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/auth/v1/otp", (route) => route.fulfill({ json: {} }));
  await page.goto("/login");
  await page.getByLabel("Work email").fill("operator@spxexpress.com");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByRole("heading", { name: "Verify OTP" })).toBeVisible();
}

async function enterCode(page: Page) {
  for (let digit = 1; digit <= 6; digit += 1) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).fill(String(digit));
  }
}

test("invalid OTP explains the failure and allows correcting the code", async ({ page }) => {
  await page.route("**/auth/v1/verify", (route) => route.fulfill({
    status: 403,
    headers: {
      "x-supabase-api-version": "2024-01-01",
      "access-control-expose-headers": "x-supabase-api-version",
    },
    json: { code: "otp_expired", message: "Token has expired or is invalid" },
  }));
  await openVerification(page);
  await enterCode(page);
  await page.getByRole("button", { name: "Verify & Continue" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "This verification code is invalid or expired. Request a new code.",
  );
  await expect(page.getByLabel("Digit 1", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Verify & Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Work email")).toHaveValue("operator@spxexpress.com");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("changing email during cooldown returns to email entry and sends to the new address", async ({ page }) => {
  const destinations: string[] = [];
  await openVerification(page);
  await page.route("**/auth/v1/otp", (route) => {
    destinations.push(route.request().postDataJSON().email);
    return route.fulfill({ json: {} });
  });
  await expect(page.getByText("Resend in")).toBeVisible();
  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByLabel("Work email").fill("replacement@spxexpress.com");
  await page.getByRole("button", { name: "Send OTP" }).click();

  await expect(page.getByRole("heading", { name: "Verify OTP" })).toBeVisible();
  await expect(page.getByText("replacement@spxexpress.com", { exact: true })).toBeVisible();
  expect(destinations).toEqual(["replacement@spxexpress.com"]);
});

test("pending verification disables editing and rejects duplicate submissions", async ({ page }) => {
  let attempts = 0;
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/auth/v1/verify", async (route) => {
    attempts += 1;
    await responseGate;
    await route.fulfill({
      status: 403,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "otp_expired", message: "Invalid code" },
    });
  });
  await openVerification(page);
  await enterCode(page);
  try {
    await page.getByRole("button", { name: "Verify & Continue" }).click();
    await expect(page.getByRole("button", { name: "Verifying" })).toBeDisabled();
    await expect(page.getByLabel("Digit 1", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Change email" })).toBeDisabled();
    await page.getByLabel("Digit 1", { exact: true }).evaluate((input) => {
      (input as HTMLInputElement).form?.requestSubmit();
    });
  } finally {
    release();
  }
  await expect(page.getByRole("alert")).toBeVisible();
  expect(attempts).toBe(1);
});

test("docking fetch failure can be retried without claiming the queue is empty", async ({ page }) => {
  await mockShellSession(page);
  let fail = true;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: {
        id: "doc-user", name: "Document officer", role: "doc_officer", is_admin: false,
      } });
    }
    if (url.pathname.endsWith("/requests")) {
      return fail
        ? route.fulfill({ status: 503, json: { message: "Queue temporarily unavailable" } })
        : route.fulfill({ json: {
          data: [], current_page: 1, last_page: 1, per_page: 100, total: 0,
        } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/docking");
  await expect(page.getByRole("alert")).toContainText("Unable to load the docking queue");
  await expect(page.getByText("No trucks are waiting for docking.")).toHaveCount(0);

  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No trucks are waiting for docking.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("pending resend blocks duplicate requests and explains resend failures", async ({ page }) => {
  await page.clock.install();
  await openVerification(page);
  await expect.poll(async () => {
    await page.clock.runFor(1000);
    return page.getByRole("button", { name: "Resend code", exact: true }).isVisible();
  }, { intervals: [10], timeout: 20_000 }).toBe(true);
  let attempts = 0;
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/auth/v1/otp", async (route) => {
    attempts += 1;
    await responseGate;
    await route.fulfill({
      status: 429,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "over_email_send_rate_limit", message: "Too many emails" },
    });
  });
  try {
    await page.getByRole("button", { name: "Resend code", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resending code" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Resend code", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Change email" })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("alert")).toHaveText(
    "Too many verification emails were requested. Wait before requesting another code.",
  );
  await expect(page.getByRole("button", { name: "Resend code", exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
});

test("failed docking refresh retains cached trucks until Retry succeeds", async ({ page }) => {
  await page.clock.install();
  await mockShellSession(page);
  let fail = false;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: {
        id: "doc-user", name: "Document officer", role: "doc_officer", is_admin: false,
      } });
    }
    if (url.pathname.endsWith("/requests")) {
      return fail
        ? route.fulfill({ status: 503, json: { message: "Queue temporarily unavailable" } })
        : route.fulfill({ json: {
          data: [{
            id: "dock-request", status: "DOCKING", cluster: "North Hub", region: "North",
            dock_no: "D-01", backlogs: 4, truck_size: "6W", truck_type: "WETLEASE",
            created_by: "doc-user", created_at: "2026-10-12T00:00:00Z",
            request_timestamp: "2026-10-12T00:00:00Z",
          }],
          current_page: 1, last_page: 1, per_page: 100, total: 1,
        } });
    }
    return route.fulfill({ json: { data: [], truck_sizes: {}, by_status: {}, total: 0 } });
  });
  await page.goto("/docking");
  await expect(page.getByText("SOC 5 > North Hub", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hourly Throughput", exact: true })).toBeVisible();
  await page.clock.runFor(31_000);
  fail = true;
  await page.getByRole("link", { name: /^Docking\b/ }).click();

  await expect(page.getByRole("alert")).toContainText("may be outdated");
  await expect(page.getByText("SOC 5 > North Hub", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("SOC 5 > North Hub", { exact: true })).toBeVisible();
});
