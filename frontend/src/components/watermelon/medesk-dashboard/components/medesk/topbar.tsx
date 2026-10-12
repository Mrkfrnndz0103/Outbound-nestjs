import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons";
import { DashboardLink, useDashboardNavigation } from "./navigation";
import { Button } from "@/components/ui/button";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { navigationGroups as defaultNavigationGroups, type NavigationGroup } from "../../data";

export function DashboardTopbar({ navigationGroups = defaultNavigationGroups }: { navigationGroups?: NavigationGroup[] }) {
  const { pathname, navigate } = useDashboardNavigation();
  const { isMobile, openMobile } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const pages = navigationGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
  const currentPage = pages.find((item) => item.href === pathname) ?? pages[0];
  const CurrentPageIcon = currentPage.icon;
  const query = searchQuery.trim().toLowerCase();
  const matches = pages.filter((item) => `${item.name} ${item.group}`.toLowerCase().includes(query));

  const openSearch = useCallback(() => {
    // A modal (including sign-in) makes the background shell unavailable.
    if (searchTriggerRef.current?.closest('[aria-hidden="true"], [inert]')) return;
    setSearchQuery("");
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (searchTriggerRef.current?.closest('[aria-hidden="true"], [inert]')) return;
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSearch]);

  return (
    <>
      <header className="flex h-18 shrink-0 items-center justify-between gap-4 px-5 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger
            size="icon"
            className="shrink-0 md:hidden [&_svg]:size-5!"
            aria-label={isMobile ? (openMobile ? "Close navigation" : "Open navigation") : "Toggle Sidebar"}
            aria-expanded={isMobile ? openMobile : undefined}
          />
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <CurrentPageIcon className="size-4 shrink-0" />
            <span className="truncate text-lg font-medium leading-6.5">{currentPage.name}</span>
          </div>
        </div>
        <Button
          ref={searchTriggerRef}
          type="button"
          variant="ghost"
          aria-label="Search pages"
          onClick={openSearch}
          className="h-10 shrink-0 gap-2 rounded-lg bg-secondary px-3 text-secondary-foreground md:w-[clamp(10rem,22vw,17.3125rem)] md:justify-start"
        >
          <SearchIcon className="size-4" />
          <span className="hidden text-sm md:inline">Go to page</span>
          <kbd aria-hidden="true" className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground md:inline">Ctrl / ⌘ K</kbd>
        </Button>
      </header>
      <AccessibleDialog
        open={searchOpen}
        label="Go to page"
        onClose={() => setSearchOpen(false)}
        returnFocus={searchTriggerRef.current}
        overlayClassName="fixed inset-0 z-[90] grid items-start justify-items-center overflow-y-auto bg-black/40 px-4 pt-[min(15vh,6rem)] pb-4 backdrop-blur-sm"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
      >
        <label htmlFor="page-search" className="mb-2 block text-sm font-semibold">Go to page</label>
        <div className="flex items-center gap-2">
          <input
            id="page-search"
            type="search"
            aria-label="Search pages"
            autoComplete="off"
            placeholder="Search pages…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && matches[0]) {
                event.preventDefault();
                navigate(matches[0].href);
                setSearchOpen(false);
              }
            }}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" variant="ghost" size="icon" aria-label="Close page search" onClick={() => setSearchOpen(false)}>
            <CloseIcon />
          </Button>
        </div>
        <nav aria-label="Matching pages" className="mt-3 max-h-[min(50dvh,20rem)] overflow-y-auto">
          {matches.map((item) => (
            <DashboardLink
              key={item.href}
              href={item.href}
              onClick={() => setSearchOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <item.icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{item.name}</span>
              <span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">{item.group}</span>
            </DashboardLink>
          ))}
          {matches.length === 0 && <p role="status" className="px-3 py-4 text-sm text-muted-foreground">No matching pages. Try another name.</p>}
        </nav>
        <p className="mt-3 text-xs text-muted-foreground">Enter opens the first match. Tab selects a page. Escape closes search.</p>
      </AccessibleDialog>
    </>
  );
}
