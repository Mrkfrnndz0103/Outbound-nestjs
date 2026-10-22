import * as React from "react";
import { cn } from "../../lib/utils";

type TabsContextValue = {
  value?: string;
  setValue: (value: string) => void;
  listId: string;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = React.ComponentProps<"div"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function Tabs({
  className,
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  ...props
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const listId = React.useId();
  const value = controlledValue ?? uncontrolledValue;
  const setValue = (nextValue: string) => {
    if (controlledValue === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, listId }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="tablist"
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1",
        className,
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = React.ComponentProps<"button"> & {
  value: string;
};

function TabsTrigger({ className, value, onClick, onKeyDown, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used inside Tabs.");

  const active = context.value === value;
  const select = () => context.setValue(value);

  return (
    <button
      type="button"
      role="tab"
      id={`${context.listId}-${value}-trigger`}
      aria-selected={active}
      aria-controls={`${context.listId}-${value}`}
      data-state={active ? "active" : "inactive"}
      data-slot="tabs-trigger"
      tabIndex={active ? 0 : -1}
      className={cn(
        "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-linehaul-teal/40 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      onClick={(event) => {
        select();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const list = event.currentTarget.parentElement;
        if (!list) return;
        const triggers = Array.from(
          list.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        );
        const index = triggers.indexOf(event.currentTarget);
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          const next = triggers[(index + 1) % triggers.length];
          next?.focus();
          next?.click();
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = triggers[(index - 1 + triggers.length) % triggers.length];
          next?.focus();
          next?.click();
        }
      }}
      {...props}
    />
  );
}

function TabsContent({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used inside Tabs.");
  const active = context.value === value;

  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${context.listId}-${value}`}
      aria-labelledby={`${context.listId}-${value}-trigger`}
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
