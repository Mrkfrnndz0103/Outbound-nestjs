import {
  ChevronRight,
  LogOutIcon,
  MoonIcon,
  MoreVerticalIcon,
  SunIcon,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import {
  type NavigationGroup,
  type NavigationItem,
  roleOptions,
} from "./navigation";
import { useTheme } from "./ThemeProvider";

export type AppSidebarUser = {
  name: string;
  email: string;
  avatar?: string;
  role?: Role;
  isAdmin?: boolean;
};

type AppSidebarProps = {
  navigationGroups: NavigationGroup[];
  currentUser: AppSidebarUser;
  onSignOut?: () => void;
  onRoleChange?: (role: Role) => void;
};

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({ item }: { item: NavigationItem }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;

  return (
    <SidebarMenuButton
      asChild
      tooltip={item.name}
      isActive={isPathActive(pathname, item.href)}
    >
      <Link
        to={item.href}
        aria-current={isPathActive(pathname, item.href) ? "page" : undefined}
        onClick={() => {
          if (isMobile) setOpenMobile(false);
        }}
      >
        <Icon />
        <span>{item.name}</span>
      </Link>
    </SidebarMenuButton>
  );
}

function NavGroupItems({ group }: { group: NavigationGroup }) {
  return (
    <SidebarMenu>
      {group.items.map((item) => (
        <SidebarMenuItem key={item.name}>
          <NavItem item={item} />
          {item.badge ? (
            <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function CollapsibleNavGroup({ group }: { group: NavigationGroup }) {
  const { pathname } = useLocation();
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const hasActiveItem = group.items.some((item) =>
    isPathActive(pathname, item.href),
  );
  const isOpen = openOverride ?? hasActiveItem;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpenOverride}>
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger
            aria-label={`Toggle ${group.label.toLowerCase()} requests`}
            className="flex w-full items-center"
          >
            <span>{group.label}</span>
            <ChevronRight
              className={cn(
                "ml-auto size-4 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <NavGroupItems group={group} />
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function UserMenu({
  currentUser,
  onSignOut,
  onRoleChange,
}: Pick<AppSidebarProps, "currentUser" | "onSignOut" | "onRoleChange">) {
  const { isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const initials = currentUser.name.slice(0, 1);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={currentUser.name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg border border-border/50">
                <AvatarImage src={currentUser.avatar} alt="" />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{currentUser.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
              <MoreVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="grid px-1 py-1.5 text-left text-sm leading-tight">
                <span className="truncate font-medium">{currentUser.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {currentUser.isAdmin && onRoleChange ? (
              <>
                <DropdownMenuLabel className="font-normal">
                  Test role view
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {roleOptions.map((role) => (
                    <DropdownMenuItem
                      key={role.value}
                      onClick={() => onRoleChange(role.value)}
                    >
                      <span>{role.label}</span>
                      {currentUser.role === role.value ? (
                        <span className="ml-auto">✓</span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOutIcon />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({
  navigationGroups,
  currentUser,
  onSignOut,
  onRoleChange,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <nav
        id="primary-navigation"
        aria-label="Primary navigation"
        className="contents"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="SOC 5 Outbound">
                <Link to="/dashboard">
                  <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Truck className="size-4" />
                  </span>
                  <span className="truncate font-semibold">SOC 5 Outbound</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {navigationGroups.map((group) =>
            group.collapsible ? (
              <CollapsibleNavGroup key={group.label} group={group} />
            ) : (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <NavGroupItems group={group} />
                </SidebarGroupContent>
              </SidebarGroup>
            ),
          )}
        </SidebarContent>

        <SidebarFooter>
          <UserMenu
            currentUser={currentUser}
            onSignOut={onSignOut}
            onRoleChange={onRoleChange}
          />
        </SidebarFooter>
        <SidebarRail />
      </nav>
    </Sidebar>
  );
}
