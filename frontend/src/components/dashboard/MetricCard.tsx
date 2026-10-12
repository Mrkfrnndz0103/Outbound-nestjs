import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  chip: string;
  footnote: ReactNode;
  primary?: boolean;
  onClick: () => void;
};

export function MetricCard({
  label,
  value,
  icon,
  chip,
  footnote,
  primary = false,
  onClick,
}: MetricCardProps) {
  return (
    <button
      type="button"
      className="group relative grid h-full min-h-[124px] min-w-0 gap-2 rounded-2xl border border-soc5-line bg-soc5-panel p-3.5 text-left text-soc5-ink shadow-[0_10px_24px_rgba(15,32,38,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-soc5-line hover:bg-linehaul-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soc5-lime-deep/40"
      data-primary={primary || undefined}
      onClick={onClick}
    >
      <span className="mb-0.5 flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-xl bg-linehaul-surface-soft text-linehaul-lime-ink ring-1 ring-linehaul-lime-ink/20">
          {icon}
        </span>
        <span className="hidden">{chip}</span>
      </span>
      <span className="flex min-h-0 flex-col items-start justify-center gap-1">
        <small className="text-xs leading-snug font-medium text-soc5-ink">
          {label}
        </small>
        <strong className="font-sans text-2xl leading-tight font-semibold tracking-tight tabular-nums text-soc5-ink">
          {value}
        </strong>
      </span>
      <span className="mt-1 flex items-center justify-between gap-1.5 text-xs leading-snug text-soc5-muted">
        <span>{footnote}</span>
        <ArrowUpRight
          className="shrink-0 text-linehaul-lime-ink opacity-70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100"
          size={16}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
