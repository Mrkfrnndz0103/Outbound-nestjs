import type { AppView } from "../types";

const paths: Record<AppView, string> = {
  overview: "/dashboard",
  "lh-request": "/outbound/lh-request",
  "truck-request": "/midmile/truck-request",
  docking: "/docking",
  kpi: "/kpi",
  users: "/users",
  "seatalk-setup": "/settings/seatalk-approval",
};

const viewsByPath = Object.fromEntries(
  Object.entries(paths).map(([view, path]) => [path, view]),
) as Record<string, AppView>;

export function getAppPath(view: AppView): string {
  return paths[view];
}

export function getAppView(pathname: string): AppView {
  return viewsByPath[pathname] ?? "overview";
}

export function isKnownAppPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname in viewsByPath;
}
