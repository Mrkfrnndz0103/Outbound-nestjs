import { ChevronDown, Columns3 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Role } from "../types";

type Option = { key: string; label: string };

export const linehaulColumnOptions: Option[] = [
  { key: "status", label: "Status" },
  { key: "runningTime", label: "Running time" },
  { key: "requestTime", label: "Request time" },
  { key: "cluster", label: "Cluster" },
  { key: "region", label: "Region" },
  { key: "dock", label: "Dock #" },
  { key: "backlogs", label: "Backlog" },
  { key: "backlogsTime", label: "Backlogs Time Stamp" },
  { key: "lhTypeRequest", label: "LH Type (Request)" },
  { key: "opsFte", label: "Ops FTE" },
  { key: "plateNumber", label: "Plate number" },
  { key: "mmFte", label: "MM FTE" },
  { key: "truckSize", label: "LH size" },
  { key: "lhTypeInput", label: "LH type (input by FTE MM)" },
  { key: "provideTime", label: "Provide Time" },
  { key: "linehaulTrip", label: "Linehaul Trip" },
  { key: "assignedTime", label: "Assigned time" },
  { key: "dockedTime", label: "Docked Time" },
  { key: "docOfficer", label: "DOC Officer" },
  { key: "opsPic", label: "OPS/PIC" },
];

export const linehaulPrimaryColumnKeys = [
  "status",
  "runningTime",
  "requestTime",
  "cluster",
  "region",
  "dock",
  "backlogs",
  "plateNumber",
  "truckSize",
  "linehaulTrip",
  "dockedTime",
] as const;

export function linehaulPrimaryColumnKeysForRole(role: Role) {
  if (role === "fte_mm") {
    return [
      "status", "requestTime", "cluster", "region", "dock", "backlogs",
      "lhTypeRequest", "lhTypeInput", "truckSize", "plateNumber", "provideTime",
    ] as const;
  }
  if (role === "doc_officer") {
    return [
      "status", "requestTime", "cluster", "region", "dock", "plateNumber",
      "truckSize", "provideTime", "assignedTime", "linehaulTrip",
    ] as const;
  }
  return linehaulPrimaryColumnKeys;
}

type Props = {
  label: string;
  options: readonly Option[];
  visible: string[];
  onChange: (next: string[]) => void;
  iconOnly?: boolean;
};

export function ColumnVisibilityMenu({
  label,
  options,
  visible,
  onChange,
  iconOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function toggle(key: string) {
    const next = visible.includes(key)
      ? visible.filter((value) => value !== key)
      : [...visible, key];
    onChange(next);
  }

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 self-center">
      <button
        className={`inline-flex min-h-[1.8rem] items-center justify-center gap-[.35rem] rounded-[.4rem] border border-soc5-line bg-soc5-panel px-[.45rem] text-xs font-medium text-soc5-muted transition-[color,background,border-color,box-shadow,transform] duration-150 hover:border-soc5-line hover:bg-linehaul-surface-soft hover:text-soc5-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep ${iconOnly ? "size-[1.8rem] p-0" : ""}`}
        type="button"
        aria-label={label}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Columns3 size={17} aria-hidden="true" />
        {!iconOnly && (
          <>
            <span>{label}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <fieldset
          id={menuId}
          className="absolute top-[calc(100%+.4rem)] right-0 z-30 m-0 grid max-h-[min(70vh,18rem)] min-w-44 max-w-[min(16rem,calc(100vw_-_1.2rem))] gap-[.1rem] overflow-y-auto rounded-[.4rem] border border-soc5-line bg-soc5-panel p-[.35rem] shadow-[0_.5rem_1.3rem_rgb(15_42_43_/_16%)] max-[760px]:max-h-[min(60vh,16rem)]"
          aria-label={label}
        >
          {options.map((option) => (
            <label key={option.key} className="flex min-h-[1.6rem] cursor-pointer items-center gap-[.4rem] rounded-[.2rem] px-[.3rem] py-[.2rem] text-xs text-soc5-ink hover:bg-linehaul-surface-soft">
              <input
                type="checkbox"
                checked={visible.includes(option.key)}
                className="accent-soc5-lime-deep"
                onChange={() => toggle(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
