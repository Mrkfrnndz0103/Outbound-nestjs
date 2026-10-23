// C:\Users\phlspxuser\Documents\development\e2e\realtime.spec.js
const { test, expect } = require("@playwright/test");
test("production Supabase realtime channels join and reconnect", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const websocketConnections = new Map();
  const joinedChannels = new Set();
  const joinsByConnection = new Map();
  const websocketErrors = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");

  cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
    if (url.includes("/realtime/v1/websocket")) {
      websocketConnections.set(requestId, { status: null, url });
    }
  });
  cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) => {
    const connection = websocketConnections.get(requestId);
    if (connection) connection.status = response.status;
  });
  cdp.on("Network.webSocketFrameSent", ({ requestId, response }) => {
    if (!websocketConnections.has(requestId)) return;
    try {
      const message = JSON.parse(response.payloadData);
      const topic = Array.isArray(message) ? message[2] : message.topic;
      const event = Array.isArray(message) ? message[3] : message.event;
      if (event === "phx_join" && typeof topic === "string") {
        joinedChannels.add(topic);
        const joins = joinsByConnection.get(requestId) ?? new Map();
        joins.set(topic, (joins.get(topic) ?? 0) + 1);
        joinsByConnection.set(requestId, joins);
      }
    } catch {
      // Ignore non-JSON WebSocket protocol frames.
    }
  });
  cdp.on("Network.webSocketFrameError", ({ errorMessage }) => {
    websocketErrors.push(errorMessage);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("main", { name: "Primary content" }),
  ).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(() => [...websocketConnections.values()].some(({ status }) => status === 101))
    .toBeTruthy();
  await expect
    .poll(() => [...joinedChannels].some((topic) => topic.startsWith("realtime:requests-realtime-")))
    .toBeTruthy();
  await expect
    .poll(() => [...joinedChannels].some((topic) => topic.startsWith("realtime:intraday-realtime-")))
    .toBeTruthy();
  await expect
    .poll(() => [...joinedChannels].some((topic) => topic.startsWith("realtime:notifications:")))
    .toBeTruthy();

  await page.context().setOffline(true);
  await page.waitForTimeout(500);
  await page.context().setOffline(false);

  await expect
    .poll(
      () =>
        [...websocketConnections.values()].filter(({ status }) => status === 101)
          .length >= 2,
      { timeout: 30_000 },
    )
    .toBeTruthy();

  expect(websocketErrors).toEqual([]);
  for (const joins of joinsByConnection.values()) {
    expect(
      [...joins.entries()]
        .filter(([topic]) => topic.startsWith("realtime:requests-realtime-"))
        .reduce((total, [, count]) => total + count, 0),
    ).toBeLessThanOrEqual(1);
    expect(
      [...joins.entries()]
        .filter(([topic]) => topic.startsWith("realtime:intraday-realtime-"))
        .reduce((total, [, count]) => total + count, 0),
    ).toBeLessThanOrEqual(1);
    expect(
      [...joins.entries()]
        .filter(([topic]) => topic.startsWith("realtime:notifications:"))
        .reduce((total, [, count]) => total + count, 0),
    ).toBeLessThanOrEqual(1);
  }
});
