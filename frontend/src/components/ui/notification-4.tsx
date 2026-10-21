import { X } from "lucide-react";
import React from "react";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader } from "./card";

export interface NotificationSource {
  name: string;
  initials: string;
  avatar?: string;
}

export interface NotificationEvent {
  id: string;
  source: NotificationSource;
  title: string;
  subtitle: string;
  timestamp: string;
  unread?: boolean;
}

export interface NotificationGroup {
  id: string;
  label: string;
  items: NotificationEvent[];
}

export interface Notification4Props {
  title?: string;
  countLabel?: string;
  groups?: NotificationGroup[];
  onDismiss?: () => void;
  onSelect?: (event: NotificationEvent) => void;
  onMarkAllRead?: () => void;
  id?: string;
  className?: string;
}

const defaultGroups: NotificationGroup[] = [
  {
    id: "morning",
    label: "Morning",
    items: [
      {
        id: "launch-checklist",
        source: {
          name: "Ava Patel",
          initials: "AP",
          avatar: "https://assets.watermelon.sh/wm_mia.png",
        },
        title: "Ava approved the launch checklist",
        subtitle: "Mobile onboarding release",
        timestamp: "12m ago",
        unread: true,
      },
      {
        id: "priority-review",
        source: {
          name: "Mateo Cruz",
          initials: "MC",
          avatar: "https://assets.watermelon.sh/wm_alex.png",
        },
        title: "Mateo assigned a priority review",
        subtitle: "Security handoff notes",
        timestamp: "24m ago",
        unread: true,
      },
      {
        id: "customer-digest",
        source: {
          name: "Nora Singh",
          initials: "NS",
        },
        title: "Nora published the customer digest",
        subtitle: "Enterprise workspace summary",
        timestamp: "38m ago",
        unread: true,
      },
    ],
  },
  {
    id: "afternoon",
    label: "Afternoon",
    items: [
      {
        id: "revenue-notes",
        source: {
          name: "Kai Morgan",
          initials: "KM",
        },
        title: "Kai shared updated revenue notes",
        subtitle: "Forecast packet and risk log",
        timestamp: "1h ago",
        unread: true,
      },
      {
        id: "audit-task",
        source: {
          name: "Iris Chen",
          initials: "IC",
          avatar: "https://assets.watermelon.sh/wm_emma.png",
        },
        title: "Iris moved the audit task forward",
        subtitle: "Compliance queue",
        timestamp: "2h ago",
        unread: true,
      },
    ],
  },
];

export default function Notification4({
  title = "Notifications",
  countLabel,
  groups = defaultGroups,
  onDismiss,
  onSelect,
  onMarkAllRead,
  id,
  className,
}: Notification4Props) {
  const unreadCount = groups.reduce(
    (total, group) => total + group.items.filter((item) => item.unread).length,
    0,
  );

  return (
    <section
      id={id}
      className={cn(
        "absolute top-[2.3rem] right-0 z-50 flex w-[min(18rem,calc(100vw-1.2rem))] max-h-[min(23rem,calc(100dvh-3.6rem))] items-center justify-center overflow-hidden rounded-lh-2026-md border border-[#e4e5e5] bg-white text-[#393a3c] shadow-[0_.6rem_1.25rem_rgb(28_29_30/14%)] max-[600px]:right-1",
        className,
      )}
    >
      <Card className="w-full max-w-none gap-0 rounded-none border-0 bg-[#fbfcf7] pb-[.4rem] shadow-none">
        <CardHeader className="flex min-h-[2.4rem] flex-row items-center justify-between gap-[.6rem] border-b border-[#f0f0f0] px-[.6rem] py-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold tracking-tight text-[#393a3c]">
              {title}
            </h2>
            <Badge className="rounded-full text-xs font-medium tabular-nums text-[#6b7a00] hover:text-[#536500]">
              {countLabel ?? String(unreadCount)}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {onMarkAllRead && unreadCount > 0 && (
              <Button
                variant="ghost"
                className="h-8 rounded-md px-2 text-xs text-[#696c70] hover:bg-[#f7f9eb]"
                type="button"
                onClick={onMarkAllRead}
              >
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-[#696c70] hover:bg-[#f7f9eb] focus-visible:outline-[.1rem] focus-visible:outline-[#71820e] focus-visible:outline-offset-[.1rem]"
              aria-label="Close notifications"
              onClick={onDismiss}
              type="button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="max-h-[min(19rem,calc(100dvh-7rem))] space-y-2 overflow-y-auto overscroll-contain px-2 py-[.4rem]">
          {groups.length ? (
            groups.map((group) => (
              <NotificationGroupCard
                key={group.id}
                group={group}
                onSelect={onSelect}
              />
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-[#696c70]">
              No notifications.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function NotificationGroupCard({
  group,
  onSelect,
}: {
  group: NotificationGroup;
  onSelect?: (event: NotificationEvent) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lh-2026-md bg-white">
      <div className="px-5 pt-4">
        <p className="text-sm font-medium text-[#696c70]">{group.label}</p>
      </div>

      <div className="px-4 pt-2 pb-2">
        {group.items.map((event) => (
          <React.Fragment key={event.id}>
            <NotificationEventRow event={event} onSelect={onSelect} />
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function NotificationEventRow({
  event,
  onSelect,
}: {
  event: NotificationEvent;
  onSelect?: (event: NotificationEvent) => void;
}) {
  return (
    <button
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-[#f7f9eb] focus-visible:outline-[.1rem] focus-visible:outline-[#71820e] focus-visible:outline-offset-[.1rem] sm:gap-3",
        event.unread && "bg-[#f7f9eb]",
      )}
      type="button"
      onClick={() => onSelect?.(event)}
    >
      <Avatar className="h-10 w-10 shrink-0 border-none ring-0">
        <AvatarImage
          src={event.source.avatar}
          alt={event.source.name}
          className="border-black/5"
        />
        <AvatarFallback className="bg-linehaul-surface-muted text-xs font-semibold text-[#696c70]">
          {event.source.initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-[#393a3c]">
          {event.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-[#696c70]">
          {event.subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        <span className="text-xs text-[#696c70]">{event.timestamp}</span>
      </div>
    </button>
  );
}
