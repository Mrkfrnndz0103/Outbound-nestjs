import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  toastBodyClass,
  toastClass,
  toastContentClass,
  toastTitleClass,
} from "../lib/uiClasses";
import {
  createRealtimeRecoveryTracker,
  type RealtimeSubscriptionStatus,
} from "../hooks/useRequestRealtime";
import { supabase } from "../lib/supabase";
import { useUiStore } from "../stores/ui";
import type { NotificationEvent, NotificationGroup } from "./ui/notification-4";
import type {
  Notification as AppNotification,
  AppView,
  Role,
  User,
} from "../types";

type Props = {
  user: User;
  preview?: boolean;
  view: AppView;
  onRoleChange: (role: Role) => void;
  onSearch: () => void;
};
const roles: Array<{ value: Role; label: string }> = [
  { value: "fte_ops", label: "FTE Ops" },
  { value: "fte_mm", label: "FTE Midmile" },
  { value: "ops_pic", label: "Ops PIC" },
  { value: "doc_officer", label: "Document Officer" },
];
const Notification4 = lazy(() => import("./ui/notification-4"));
const page = {
  overview: { name: "Dashboard", section: "Overview" },
  "lh-request": { name: "LH Request", section: "Outbound" },
  "truck-request": { name: "Truck Request", section: "Midmile" },
  docking: { name: "Docking Confirmation", section: "Docking" },
  kpi: { name: "KPI", section: "Performance" },
  users: { name: "User Management", section: "Administration" },
};

const topbarIconButtonClass =
  "relative grid size-9 place-items-center rounded-lg bg-transparent text-[#7b8987] transition-[color,background,transform] duration-200 hover:-translate-y-px hover:bg-[#f1f5f3] hover:text-[#33403f] aria-expanded:bg-[#eef1f0] aria-expanded:text-[#33403f] max-[480px]:size-8";
const topbarMenuWrapClass = "relative min-w-0";
const topbarPopoverClass =
  "absolute top-[2.3rem] right-0 z-50 min-w-[8.75rem] rounded-[.6rem] border border-[#e4e5e5] bg-white p-[.55rem] text-xs text-[#393a3c] shadow-[0_.6rem_1.25rem_rgb(28_29_30_/_14%)]";
const filterOptionClass =
  "flex w-full items-center justify-between gap-[.4rem] border-t border-[#f0f0f0] bg-transparent py-[.4rem] text-left text-[#666] first:border-t-0 hover:text-soc5-ink";
const notificationBadgeClass =
  "absolute -top-[.15rem] -right-[.15rem] grid min-h-[1.05rem] min-w-[1.05rem] place-items-center rounded-md border border-white bg-[#687a75] px-[.25rem] text-xs font-semibold tabular-nums text-white";
const mailDotClass =
  "absolute top-[.4rem] right-[.4rem] size-[.35rem] rounded-full border-[.075rem] border-white bg-[#687a75]";
const mailPopoverClass =
  "absolute top-[2.3rem] right-0 z-50 w-[min(18rem,calc(100vw_-_1.2rem))] max-h-[min(23rem,calc(100dvh_-_3.6rem))] overflow-hidden rounded-[.6rem] border border-[#e4e5e5] bg-white text-[#393a3c] shadow-[0_.6rem_1.25rem_rgb(28_29_30_/_14%)] max-[600px]:right-1";
const messageListClass =
  "grid max-h-[min(19rem,calc(100dvh_-_7rem))] gap-1 overflow-y-auto overscroll-contain p-1";
const messageItemClass =
  "grid w-full min-w-0 grid-cols-[auto_1fr] items-center gap-[.15rem] rounded-[.45rem] border border-[#e6ece9] border-l-2 border-l-transparent bg-white px-[.55rem] py-2 text-left text-[#333] transition-[background-color,border-color] duration-150 hover:border-[#d6e0dc] hover:bg-[#f4f7f5] focus-visible:outline-[.1rem] focus-visible:outline-[#8d9a97] focus-visible:outline-offset-[.1rem] active:bg-[#eef2f0] [&.is-unread]:border-l-[#687a75] [&.is-unread]:bg-[#f4f7f5] [&_svg]:row-span-2 [&_svg]:text-[#687a75] [&_span]:min-w-0 [&_span]:text-xs [&_span]:font-semibold [&_small]:text-xs [&_small]:leading-snug [&_small]:text-[#696c70]";
const profileButtonClass =
  "flex min-h-[1.9rem] max-w-[min(11rem,22vw)] min-w-0 items-center gap-[.35rem] rounded-lg bg-transparent px-2 py-0 text-left text-[#77787c] hover:bg-[#f1f2f2] max-[960px]:max-w-[1.9rem] max-[600px]:max-w-[1.9rem] [&>div]:grid [&>div]:min-w-0 [&>div]:gap-[.05rem] max-[600px]:[&>div]:hidden max-[600px]:[&>svg:last-child]:hidden [&_strong]:max-w-[5.5rem] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-xs [&_strong]:text-[#343538] [&_small]:text-xs [&_small]:capitalize [&_small]:text-[#999] [&>svg:last-child]:ml-[.15rem]";
const profileMenuClass =
  "absolute top-[2.3rem] right-0 z-50 w-48 overflow-hidden rounded-[.6rem] border border-[#e4e5e5] bg-white p-1 text-[#393a3c] shadow-[0_.6rem_1.25rem_rgb(28_29_30_/_14%)] max-[600px]:right-1";
let notificationAudioContext: AudioContext | null = null;

function notificationAudio() {
  if (typeof window.AudioContext === "undefined") return null;
  notificationAudioContext ??= new window.AudioContext();
  return notificationAudioContext;
}

function playNotificationSound() {
  const context = notificationAudio();
  if (!context) return;
  void context.resume().then(() => {
    const start = context.currentTime + 0.02;
    for (const [offset, frequency] of [[0, 659.25], [0.13, 880]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.1, start + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.31);
    }
  }).catch(() => undefined);
}

function formatDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function relativeNotificationTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function notificationGroups(alerts: AppNotification[]): NotificationGroup[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map<string, NotificationEvent[]>();

  for (const alert of alerts) {
    const created = new Date(alert.created_at);
    const label =
      created.toDateString() === today.toDateString()
        ? "Today"
        : created.toDateString() === yesterday.toDateString()
          ? "Yesterday"
          : "Earlier";
    const items = groups.get(label) ?? [];
    items.push({
      id: String(alert.id),
      source: { name: "SOC5 Operations", initials: "SO" },
      title: alert.title,
      subtitle: alert.body,
      timestamp: relativeNotificationTime(alert.created_at),
      unread: !alert.read_at,
    });
    groups.set(label, items);
  }

  return ["Today", "Yesterday", "Earlier"]
    .filter((label) => groups.has(label))
    .map((label) => ({
      id: label.toLowerCase(),
      label,
      items: groups.get(label)!,
    }));
}

export function AppHeader({
  user,
  preview = false,
  view,
  onRoleChange,
  onSearch,
}: Props) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const search = useUiStore((state) => state.search);
  const setSearch = useUiStore((state) => state.setSearch);
  const setDateRange = useUiStore((state) => state.setDateRange);
  const resetDateRange = useUiStore((state) => state.resetDateRange);
  const searchRef = useRef<HTMLInputElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const mailMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLElement>(null);
  const knownNotification = useRef<number | null>(null);
  const notificationMenuId = useId();
  const profileMenuId = useId();
  const [toast, setToast] = useState<AppNotification | null>(null);
  const notifications = useQuery({
    queryKey: ["notifications", user.role],
    queryFn: () =>
      api<{ data: AppNotification[]; unread: number }>("/notifications"),
    refetchInterval: false,
    enabled: !preview,
  });
  const read = useMutation({
    mutationFn: (id: number) =>
      api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const count = notifications.data?.unread ?? 0;
  const alerts = notifications.data?.data ?? [];
  const groupedNotifications = notificationGroups(alerts);
  useEffect(() => {
    if (preview) return;
    const recoverAfterReconnect = createRealtimeRecoveryTracker(() =>
      client.invalidateQueries({ queryKey: ["notifications"] }),
    );

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void client.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe((status) =>
        recoverAfterReconnect(
          "notifications",
          status as RealtimeSubscriptionStatus,
        ),
      );

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, preview, user.id]);

  useEffect(() => {
    if (preview) return;
    const unlock = () => void notificationAudio()?.resume().catch(() => undefined);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [preview]);

  useEffect(() => {
    if (notifications.isPending || notifications.isError) return;
    const latestId = alerts.length ? Math.max(...alerts.map((item) => item.id)) : 0;
    if (knownNotification.current === null) {
      knownNotification.current = latestId;
      return;
    }
    if (latestId > knownNotification.current) {
      const newlyAdded = alerts.filter((item) => item.id > knownNotification.current!);
      knownNotification.current = latestId;
      const latest = newlyAdded.find((item) => !item.read_at) ?? newlyAdded[0];
      if (latest) setToast(latest);
      window.setTimeout(() => setToast(null), 5000);
      playNotificationSound();
    }
  }, [alerts, notifications.isError, notifications.isPending]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!open && !filterOpen && !mailOpen && !profileOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        open &&
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(target) &&
        !notificationButtonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
      if (
        filterOpen &&
        filterMenuRef.current &&
        !filterMenuRef.current.contains(target)
      )
        setFilterOpen(false);
      if (
        mailOpen &&
        mailMenuRef.current &&
        !mailMenuRef.current.contains(target)
      )
        setMailOpen(false);
      if (
        profileOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target) &&
        !profileButtonRef.current?.contains(target)
      ) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (open) {
        setOpen(false);
        notificationButtonRef.current?.focus();
      }
      if (profileOpen) {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [filterOpen, mailOpen, open, profileOpen]);

  const searchPlaceholder =
    view === "overview"
      ? "Search requests, then press Enter"
      : `Search ${page[view].section.toLowerCase()} requests, then press Enter`;

  return (
    <header
      className={
        preview
          ? "hidden"
          : "fixed top-0 right-0 left-[15.5rem] z-99999 flex min-h-[4.5rem] items-center justify-between gap-4 border-b border-[#e2e8e5] bg-[rgb(255_255_255/92%)] px-6 backdrop-blur-[.7rem] max-[1100px]:left-[14rem] max-[960px]:left-0 max-[960px]:min-h-[3.8rem] max-[960px]:px-4 max-[600px]:min-h-[3.4rem]"
      }
    >
      {toast && (
        <div className={toastClass} role="status">
          <Bell size={17} />
          <div className={toastContentClass}>
            <strong className={toastTitleClass}>{toast.title}</strong>
            <span className={toastBodyClass}>{toast.body}</span>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="grid min-w-0 gap-[.1rem]">
          <h1 className="m-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xl font-medium leading-tight tracking-tight text-[#273837] max-[600px]:text-lg">
            {page[view].name}
          </h1>
          <nav
            className="flex min-h-[.7rem] items-center gap-[.3rem] text-xs leading-none text-[#a1a2a6] max-[960px]:hidden"
            aria-label="Breadcrumb"
          >
            <span className="font-medium text-[#84928f]">Operations</span>
            <ChevronRight
              className="text-[#c4c5c7]"
              size={12}
              aria-hidden="true"
            />
            <span className="font-medium text-[#667773]" aria-current="page">
              {page[view].section}
            </span>
          </nav>
        </div>
      </div>
      <div className="flex min-w-0 flex-[0_1_auto] items-center gap-[.35rem] max-[960px]:gap-[.2rem]">
        <form
          className="group flex h-9 w-[clamp(8rem,22vw,15rem)] max-w-full min-w-0 items-center gap-2 rounded-lg border border-[#e1e9e5] bg-[#f5f8f6] px-3 text-[#7b8987] max-[1100px]:w-[clamp(7rem,20vw,12rem)] max-[960px]:w-36 max-[600px]:w-9 max-[600px]:justify-center max-[600px]:px-0 focus-within:max-[600px]:w-28 focus-within:max-[600px]:justify-start focus-within:max-[600px]:px-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (search.trim()) onSearch();
          }}
        >
          <Search size={17} />
          <input
            className="w-full min-w-0 border-0 bg-transparent text-xs text-[#343538] outline-none placeholder:text-[#b0b1b5] max-[600px]:hidden group-focus-within:max-[600px]:block"
            ref={searchRef}
            aria-label={`Search requests in ${page[view].section}`}
            placeholder={searchPlaceholder}
            title={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className="shrink-0 rounded-[.2rem] border border-[#ddd] bg-white px-[.2rem] py-[.1rem] text-xs text-[#999] max-[960px]:hidden">
            Ctrl F
          </kbd>
        </form>
        <div ref={filterMenuRef} className={topbarMenuWrapClass}>
          <button
            className={topbarIconButtonClass}
            type="button"
            onClick={() => setFilterOpen((value) => !value)}
            aria-label="Filter dashboard"
            aria-expanded={filterOpen}
          >
            <SlidersHorizontal size={19} />
          </button>
          {filterOpen && (
            <section
              className={topbarPopoverClass}
              aria-label="Dashboard filters"
            >
              <strong className="mb-[.3rem] block text-xs">
                Quick filters
              </strong>
              <button
                className={filterOptionClass}
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 29);
                  setDateRange(formatDate(start), formatDate(end));
                  setFilterOpen(false);
                }}
              >
                Last 30 days <span>✓</span>
              </button>
              <button
                className={filterOptionClass}
                type="button"
                onClick={() => {
                  resetDateRange();
                  setFilterOpen(false);
                }}
              >
                All requests <span>✓</span>
              </button>
              <button
                className={filterOptionClass}
                type="button"
                onClick={() => {
                  setSearch("");
                  resetDateRange();
                  setFilterOpen(false);
                }}
              >
                Clear filters <X size={13} />
              </button>
            </section>
          )}
        </div>
        <div ref={notificationMenuRef} className="relative min-w-0">
          <button
            ref={notificationButtonRef}
            className={topbarIconButtonClass}
            type="button"
            title="Notifications"
            aria-label={`Open notifications, ${count} unread`}
            aria-expanded={open}
            aria-controls={notificationMenuId}
            onClick={() => {
              setOpen((value) => !value);
              setMailOpen(false);
              setFilterOpen(false);
            }}
          >
            <Bell size={19} />
            {count > 0 && (
              <span className={notificationBadgeClass}>
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
          {open && (
            <Suspense fallback={null}>
              <Notification4
                countLabel={String(count)}
                groups={groupedNotifications}
                id={notificationMenuId}
                onMarkAllRead={() => readAll.mutate()}
                onDismiss={() => {
                  setOpen(false);
                  notificationButtonRef.current?.focus();
                }}
                onSelect={(event) => {
                  const item = alerts.find(
                    (alert) => String(alert.id) === event.id,
                  );
                  if (item && !item.read_at) read.mutate(item.id);
                  setOpen(false);
                  notificationButtonRef.current?.focus();
                }}
                title="Notifications"
              />
            </Suspense>
          )}
        </div>
        <div ref={mailMenuRef} className={topbarMenuWrapClass}>
          <button
            className={topbarIconButtonClass}
            type="button"
            onClick={() => {
              setMailOpen((value) => !value);
              setOpen(false);
              setFilterOpen(false);
            }}
            aria-label="Messages"
            aria-expanded={mailOpen}
          >
            <Mail size={19} />
            {count > 0 && <i className={mailDotClass} />}
          </button>
          {mailOpen && (
            <section className={mailPopoverClass} aria-label="Messages">
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-[.6rem] py-[.6rem]">
                <strong className="text-xs">Messages</strong>
                <span className="text-xs text-[#667773]">{count} new</span>
              </div>
              {alerts.length ? (
                <div className={messageListClass}>
                  {alerts.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      className={`${messageItemClass}${item.read_at ? "" : " is-unread"}`}
                      type="button"
                      onClick={() => {
                        if (!item.read_at) read.mutate(item.id);
                        setMailOpen(false);
                      }}
                    >
                      <Mail size={14} />
                      <span>{item.title}</span>
                      <small>{item.body}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-center text-xs text-[#696c70]">
                  No new messages.
                </p>
              )}
              {count > 0 && (
                <button
                  className="w-full rounded-none bg-[#f7f9f8] px-2 py-2 text-center text-xs font-semibold text-[#667773] outline-offset-2 focus-visible:outline-[.1rem] focus-visible:outline-[#8d9a97]"
                  type="button"
                  onClick={() => {
                    readAll.mutate();
                    setMailOpen(false);
                  }}
                >
                  Mark all read
                </button>
              )}
            </section>
          )}
        </div>
        {user.is_admin && (
          <div className="relative min-w-0">
            <button
              ref={profileButtonRef}
              className={profileButtonClass}
              type="button"
              aria-expanded={profileOpen}
              aria-controls={profileMenuId}
              onClick={() => setProfileOpen((value) => !value)}
            >
              <UserCircle size={22} />
              <div>
                <strong>{user.name}</strong>
                <small>
                  {user.is_admin
                    ? "Administrator"
                    : user.role.replaceAll("_", " ")}
                </small>
              </div>
              <ChevronDown
                size={14}
                className="ml-[.15rem] max-[600px]:hidden"
              />
            </button>
            {profileOpen && (
              <section
                ref={profileMenuRef}
                id={profileMenuId}
                className={profileMenuClass}
                aria-label="Profile"
              >
                <header className="flex items-center gap-[.4rem] border-b border-[#eee] p-2">
                  <ShieldCheck size={18} />
                  <div className="grid gap-[.1rem]">
                    <strong className="text-xs">Test role view</strong>
                    <small className="text-xs text-[#999]">
                      Admin access remains enabled
                    </small>
                  </div>
                </header>
                {user.is_admin ? (
                  roles.map((role) => (
                    <button
                      key={role.value}
                      className="flex w-full items-center justify-between rounded-[.5rem] bg-transparent px-2 py-[.45rem] text-left text-xs text-[#666] hover:bg-[#f1f5f3] hover:text-soc5-ink"
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        void onRoleChange(role.value);
                        profileButtonRef.current?.focus();
                      }}
                    >
                      <span>{role.label}</span>
                      {user.role === role.value && <Check size={16} />}
                    </button>
                  ))
                ) : (
                  <p className="p-2 text-xs text-[#777]">
                    Signed in as {user.role.replaceAll("_", " ")}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
