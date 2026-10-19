import { useQueryClient } from "@tanstack/react-query";
import { useRequestRealtime } from "../hooks/useRequestRealtime";
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/watermelon/medesk-dashboard/dashboard-layout";
import { MedeskNavigationAdapter, createAppNavigationGroups } from "../components/shell/MedeskNavigationAdapter";
import { Skeleton } from "../components/Skeleton";
import { SkeletonTable } from "../components/SkeletonTable";
import { useQueueNotifications } from "../hooks/useQueueNotifications";
import { useApprovalPresence } from "../hooks/useApprovalPresence";
import { getAppPath, getAppView } from "../lib/routes";
import {
  dashboardGridClass,
  dashboardPanelClass,
  dashboardViewClass,
  dashboardTripsPanelClass,
  intradayCardClass,
  intradayFiltersClass,
  intradayShellClass,
  lineChartClass,
  dashboardListClass,
  loadingChipClass,
  loadingShellClass,
  loadingToolbarClass,
  overviewMetricsClass,
  workspaceViewClass,
} from "../lib/uiClasses";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useUiStore } from "../stores/ui";
import type { AppView, Role, User } from "../types";

const Overview = lazy(() =>
  import("./Overview").then((module) => ({ default: module.Overview })),
);
const OutboundRequests = lazy(() =>
  import("./OutboundRequests").then((module) => ({
    default: module.OutboundRequests,
  })),
);
const MidmileRequests = lazy(() =>
  import("./MidmileRequests").then((module) => ({
    default: module.MidmileRequests,
  })),
);
const DockingConfirmation = lazy(() =>
  import("./DockingConfirmation").then((module) => ({
    default: module.DockingConfirmation,
  })),
);
const Kpi = lazy(() =>
  import("./Kpi").then((module) => ({ default: module.Kpi })),
);
const UserManagement = lazy(() =>
  import("./UserManagement").then((module) => ({
    default: module.UserManagement,
  })),
);

export function Dashboard({
  user,
  preview = false,
}: {
  user: User;
  preview?: boolean;
}) {
  useRequestRealtime();

  const queryClient = useQueryClient();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const viewRole = useUiStore((state) => state.viewRole);
  const setViewRole = useUiStore((state) => state.setViewRole);
  const isPreview = preview;
  const activeUser = {
    ...user,
    role: user.is_admin && viewRole ? viewRole : user.role,
  };
  useApprovalPresence(activeUser.role);
  const allowed = (candidate: AppView) =>
    candidate === "overview" ||
    (candidate === "lh-request" &&
      (activeUser.role === "ops_pic" ||
        activeUser.role === "fte_ops" ||
        activeUser.role === "doc_officer")) ||
    (candidate === "truck-request" && activeUser.role === "fte_mm") ||
    (candidate === "docking" && activeUser.role === "doc_officer") ||
    candidate === "kpi" ||
    (candidate === "users" &&
      (activeUser.role === "fte_ops" || activeUser.role === "fte_mm"));
  const requestedView = getAppView(location.pathname);
  const view = allowed(requestedView) ? requestedView : "overview";
  const queue = useQueueNotifications(activeUser, isPreview);
  const navigationGroups = createAppNavigationGroups({
    role: activeUser.role,
    pendingCount: queue.count,
  });

  async function switchRole(role: Role) {
    setViewRole(role);
    routerNavigate(getAppPath("overview"));
    await queryClient.invalidateQueries();
  }

  function navigate(next: AppView, replace = false) {
    if (!allowed(next)) next = "overview";
    const path = getAppPath(next);
    routerNavigate(path, { replace });
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      try {
        await api("/auth/seatalk/logout", { method: "POST" });
      } catch {
        // Supabase sign-out still leaves the client signed out if the
        // optional SeaTalk session cleanup is unavailable.
      }
    }
  }

  useEffect(() => {
    if (location.pathname !== getAppPath(view))
      routerNavigate(getAppPath(view), { replace: true });
  }, [location.pathname, routerNavigate, view]);

  return (
    <MedeskNavigationAdapter>
      <DashboardLayout
        navigationGroups={navigationGroups}
        currentUser={{ name: activeUser.name, email: activeUser.email ?? "", role: activeUser.role, isAdmin: activeUser.is_admin }}
        onSignOut={() => void signOut()}
        onRoleChange={(role) => void switchRole(role)}
      >
        <section className="relative z-[2] flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-y-auto overscroll-y-contain" aria-live="polite">
          <Suspense fallback={<ViewLoading view={view} />}>
            {view === "overview" && (
              <Overview user={activeUser} onNavigate={navigate} preview={isPreview} />
            )}
            {view === "lh-request" && <OutboundRequests user={activeUser} queue={queue} />}
            {view === "truck-request" && <MidmileRequests user={activeUser} queue={queue} />}
            {view === "docking" && <DockingConfirmation user={activeUser} queue={queue} />}
            {view === "kpi" && <Kpi />}
            {view === "users" && <UserManagement />}
          </Suspense>
        </section>
      </DashboardLayout>
    </MedeskNavigationAdapter>
  );
}

function ViewLoading({ view }: { view: AppView }) {
  if (view === "overview") {
    return (
      <div className={dashboardViewClass}>
        <section className={`${overviewMetricsClass} min-[1024px]:grid-cols-4`} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="grid min-h-[138px] min-w-0 gap-2 rounded-xl bg-white p-5"
            >
              <span className="mb-1.5 flex items-center justify-between">
                <span className="grid size-8 place-items-center rounded-lg bg-[#f7ffdf] text-[#a2c500]">
                  <Skeleton
                    width={18}
                    height={18}
                    radius={999}
                    variant="head"
                  />
                </span>
                <span className={loadingChipClass} />
              </span>
              <span className="flex min-h-0 flex-col items-start justify-center gap-1.5">
                <Skeleton width={88} variant="head" className="mb-2.5" />
                <Skeleton width={64} height={26} />
              </span>
              <span className="mt-2.5 flex items-center justify-between gap-1.5">
                <Skeleton width={140} />
              </span>
            </div>
          ))}
        </section>
        <section className={intradayShellClass} aria-hidden="true">
          <article className={intradayCardClass}>
            <div className="flex items-center justify-between gap-3.5 mb-2 max-[600px]:flex-col max-[600px]:items-start">
              <div>
                <Skeleton width={150} variant="head" />
                <Skeleton width={220} className="mt-2.5" />
              </div>
              <div className={intradayFiltersClass}>
                <span className={loadingChipClass} />
                <span className={loadingChipClass} />
                <span className={loadingChipClass} />
              </div>
            </div>
            <div className={lineChartClass}>
              <SkeletonTable columns={2} rows={3} compact />
            </div>
          </article>
        </section>
        <section className={dashboardGridClass}>
          <article className="dashboard-panel chart-panel truck-mix-panel">
            <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5">
              <div>
                <Skeleton width={110} variant="head" />
                <Skeleton width={160} className="mt-2.5" />
              </div>
            </div>
            <div className={loadingShellClass}>
              <SkeletonTable columns={2} rows={3} compact />
            </div>
          </article>
          <article className={`${dashboardPanelClass} ${dashboardTripsPanelClass}`}>
            <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5">
              <div>
                <Skeleton width={120} variant="head" />
                <Skeleton width={180} className="mt-2.5" />
              </div>
            </div>
            <div className={dashboardListClass}>
              <SkeletonTable columns={4} rows={4} compact />
            </div>
          </article>
          <article className={`${dashboardPanelClass} min-h-[15.5rem]`}>
            <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5">
              <div>
                <Skeleton width={120} variant="head" />
                <Skeleton width={180} className="mt-2.5" />
              </div>
            </div>
            <div className={dashboardListClass}>
              <SkeletonTable columns={4} rows={4} compact />
            </div>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className={workspaceViewClass}>
      <div className={loadingShellClass}>
        <div className={loadingToolbarClass}>
          <span className={loadingChipClass} />
          <span className={loadingChipClass} />
          <span className={loadingChipClass} />
        </div>
        <SkeletonTable columns={14} rows={5} />
      </div>
    </div>
  );
}
