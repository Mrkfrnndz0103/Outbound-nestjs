import { MoreHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { requestToolbarIconClass, rowMenuClass, rowMenuWrapClass } from "../lib/uiClasses";

const MENU_WIDTH = 148;
const VIEWPORT_EDGE = 8;

type Props = {
  open: boolean;
  onToggle: () => void;
  ariaLabel: string;
  className?: string;
  title?: string;
  children: ReactNode;
};

export function LhRowActionMenu({
  open,
  onToggle,
  ariaLabel,
  className = requestToolbarIconClass,
  title = "More actions",
  children,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 160;
      const canOpenBelow =
        window.innerHeight - triggerRect.bottom >= menuHeight + VIEWPORT_EDGE;
      const top = canOpenBelow
        ? triggerRect.bottom + 2
        : triggerRect.top - menuHeight - 2;
      const left = Math.min(
        Math.max(VIEWPORT_EDGE, triggerRect.right - MENU_WIDTH),
        Math.max(VIEWPORT_EDGE, window.innerWidth - MENU_WIDTH - VIEWPORT_EDGE),
      );

      setPosition({
        top: Math.max(VIEWPORT_EDGE, top),
        left,
      });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <span className={rowMenuWrapClass}>
      <button
        ref={triggerRef}
        className={`${className}${open ? " border-[#a2c500] bg-linehaul-lime-surface text-linehaul-lime-ink shadow-[0_0_0_.15rem_rgb(162_197_0_/_12%)]" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {open &&
        createPortal(
          <span
            ref={menuRef}
            className={rowMenuClass}
            role="menu"
            style={
              position
                ? { top: position.top, left: position.left }
                : { visibility: "hidden" }
            }
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
