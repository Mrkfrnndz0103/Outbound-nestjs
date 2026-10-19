import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Role } from "@/types";
import { AppSidebar, type AppSidebarUser } from "./AppSidebar";
import type { NavigationGroup } from "./navigation";
import { SiteHeader } from "./SiteHeader";
import { ThemeProvider } from "./ThemeProvider";
import "./app-shell.css";

type AppShellProps = {
  children: ReactNode;
  navigationGroups: NavigationGroup[];
  currentUser: AppSidebarUser;
  onSignOut?: () => void;
  onRoleChange?: (role: Role) => void;
};

export function AppShell({
  children,
  navigationGroups,
  currentUser,
  onSignOut,
  onRoleChange,
}: AppShellProps) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="soc5-medesk-theme">
      <TooltipProvider>
        <SidebarProvider
          className="app-shell h-svh overflow-hidden text-foreground"
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "3rem",
            } as CSSProperties
          }
        >
          <AppSidebar
            navigationGroups={navigationGroups}
            currentUser={currentUser}
            onSignOut={onSignOut}
            onRoleChange={onRoleChange}
          />
          <SidebarInset
            aria-label="Primary content"
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <SiteHeader navigationGroups={navigationGroups} />
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
