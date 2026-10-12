import { ChevronDown } from "lucide-react";

export function RequestExpandButton({
  requestId,
  expanded,
  onToggle,
}: {
  requestId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="grid size-7 shrink-0 place-items-center rounded-full text-soc5-muted transition-colors hover:bg-linehaul-lime-surface hover:text-linehaul-lime-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#718071]"
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} details for request ${requestId}`}
      onClick={onToggle}
    >
      <ChevronDown
        aria-hidden="true"
        className={`size-3.5 transition-transform ${expanded ? "rotate-180 text-linehaul-lime-ink" : ""}`}
      />
    </button>
  );
}
