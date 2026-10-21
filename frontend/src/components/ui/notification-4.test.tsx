import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Notification4, { type NotificationGroup } from "./notification-4";

const groups: NotificationGroup[] = [
  {
    id: "today",
    label: "Today",
    items: [
      {
        id: "request-approved",
        source: { name: "Operations", initials: "OP" },
        title: "Request approved",
        subtitle: "North Hub is ready for dispatch",
        timestamp: "12m ago",
        unread: true,
      },
    ],
  },
];

describe("Notification4", () => {
  it("renders supplied notifications and exposes a dismissible panel", () => {
    const markup = renderToStaticMarkup(
      <Notification4 groups={groups} countLabel="1" onDismiss={vi.fn()} />,
    );

    expect(markup).toContain("Request approved");
    expect(markup).toContain("North Hub is ready for dispatch");
    expect(markup).toContain('aria-label="Close notifications"');
    expect(markup).toContain(">1</span>");
  });
});
