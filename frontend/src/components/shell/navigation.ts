import {
  BarChart3,
  LayoutDashboard,
  Route,
  ShipWheel,
  Truck,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Role, User } from "../../types";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
  name: string;
  href: string;
  icon: NavIcon;
  badge?: string;
};

export type NavigationGroup = {
  label: string;
  collapsible?: boolean;
  items: NavigationItem[];
};

type NavigationOptions = Pick<User, "role"> & { pendingCount: number };

export function createAppNavigationGroups({
  role,
  pendingCount,
}: NavigationOptions): NavigationGroup[] {
  const badge =
    pendingCount > 0 ? String(Math.min(pendingCount, 99)) : undefined;
  const groups: NavigationGroup[] = [
    {
      label: "Workspace",
      items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
    },
  ];

  if (role === "ops_pic" || role === "fte_ops" || role === "doc_officer") {
    groups.push({
      label: "Outbound",
      collapsible: true,
      items: [
        {
          name: "LH Request",
          href: "/outbound/lh-request",
          icon: Route,
          badge,
        },
      ],
    });
  }

  if (role === "fte_mm") {
    groups.push({
      label: "Midmile",
      collapsible: true,
      items: [
        {
          name: "Truck Request",
          href: "/midmile/truck-request",
          icon: Truck,
          badge,
        },
      ],
    });
  }

  if (role === "doc_officer") {
    groups.push({
      label: "Operations",
      items: [{ name: "Docking", href: "/docking", icon: ShipWheel, badge }],
    });
  }

  groups.push({
    label: "Performance",
    items: [{ name: "KPI", href: "/kpi", icon: BarChart3 }],
  });

  if (role === "fte_ops" || role === "fte_mm") {
    groups.push({
      label: "Administration",
      items: [{ name: "User Management", href: "/users", icon: Users }],
    });
  }

  return groups;
}

export const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "ops_pic", label: "Ops PIC" },
  { value: "fte_ops", label: "FTE Ops" },
  { value: "fte_mm", label: "FTE Midmile" },
  { value: "doc_officer", label: "Doc Officer" },
];
