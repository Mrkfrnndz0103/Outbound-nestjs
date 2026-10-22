import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type PopoverContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopover() {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error("Popover components must be used inside Popover.");
  }
  return context;
}

function Popover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const content = document.querySelector('[data-slot="popover-content"]');
      if (!rootRef.current?.contains(target) && !content?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
    };
  }, [open]);

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

function PopoverTrigger({
  render,
  children,
}: {
  render: React.ReactElement;
  children: React.ReactNode;
}) {
  const { open, setOpen, triggerRef } = usePopover();
  const trigger = render as React.ReactElement<{
    onClick?: (event: React.MouseEvent) => void;
  }>;
  return React.cloneElement(
    render as React.ReactElement<{
      "aria-expanded"?: boolean;
      onClick?: (event: React.MouseEvent) => void;
      children?: React.ReactNode;
    }>,
    {
      "aria-expanded": open,
      onClick: (event: React.MouseEvent) => {
        triggerRef.current = event.currentTarget as HTMLElement;
        trigger.props.onClick?.(event);
        if (!event.defaultPrevented) setOpen((current) => !current);
      },
      children,
    },
  );
}

function PopoverContent({ className, children }: React.ComponentProps<"div">) {
  const { open, triggerRef } = usePopover();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current || !contentRef.current) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;
      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const margin = 8;
      const left = Math.min(
        Math.max(margin, triggerRect.left),
        Math.max(margin, window.innerWidth - contentRect.width - margin),
      );
      const below = triggerRect.bottom + margin;
      const above = triggerRect.top - contentRect.height - margin;
      const top =
        below + contentRect.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, above);
      setPosition({ top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={contentRef}
      data-slot="popover-content"
      role="dialog"
      aria-modal="false"
      style={{ top: position.top, left: position.left }}
      className={cn(
        "fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export { Popover, PopoverContent, PopoverTrigger };
