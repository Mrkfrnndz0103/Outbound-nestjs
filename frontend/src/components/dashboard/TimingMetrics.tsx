import { ArrowUpRight, Clock3, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type TimingMetric = {
  label: string;
  value: string;
  loading: boolean;
  detail: string;
  context: string;
  icon: ReactNode;
  accent: "lime" | "teal";
  minutes?: number | null;
};

type TimingMetricsProps = {
  dwellMinutes?: number | null;
  waitingMinutes?: number | null;
  isLoading?: boolean;
  formatDuration: (minutes?: number | null) => string;
  onOpenDetails: () => void;
};

function TimingCard({ metric, maxMinutes, onOpenDetails }: { metric: TimingMetric; maxMinutes: number; onOpenDetails: () => void }) {
  const width = metric.minutes != null && maxMinutes > 0 ? Math.max(18, Math.round((metric.minutes / maxMinutes) * 100)) : 18;
  const accentClass = metric.accent === "teal" ? "text-linehaul-teal-ink bg-linehaul-teal-soft" : "text-linehaul-lime-ink bg-linehaul-lime-surface";
  const barClass = metric.accent === "teal" ? "bg-[#0b7f78]" : "bg-[#b5d93f]";

  return (
    <button
      type="button"
      className="group relative min-w-0 overflow-hidden rounded-[.75rem] border border-soc5-line bg-soc5-panel p-3.5 text-left shadow-[0_.35rem_1rem_rgb(15_32_38_/_4%)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[#a8c4bd] hover:shadow-[0_.6rem_1.2rem_rgb(15_32_38_/_8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soc5-lime-deep/40 motion-reduce:transition-none"
      onClick={onOpenDetails}
      aria-label={`${metric.label}: ${metric.loading ? "Loading" : metric.value}. Open request details.`}
    >
      <span className="mb-3 flex items-start justify-between gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-[.6rem] ${accentClass} ring-1 ring-current/15`}>
          {metric.icon}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-soc5-line bg-linehaul-surface-soft px-2 py-1 text-[.66rem] font-semibold text-soc5-muted">
          {metric.context}
          <ArrowUpRight size={12} aria-hidden="true" className="text-linehaul-lime-ink transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
        </span>
      </span>
      <span className="block text-xs font-semibold text-soc5-muted">{metric.label}</span>
      <span className="mt-1 block min-h-9 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-soc5-ink">
        {metric.loading ? <Skeleton className="mt-1 h-7 w-20" /> : metric.value}
      </span>
      <span className="mt-3 block text-xs leading-snug text-soc5-muted">{metric.detail}</span>
      <span className="mt-3 block h-1 overflow-hidden rounded-full bg-linehaul-surface-soft" aria-hidden="true">
        <span className={`block h-full rounded-full ${barClass} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${metric.loading ? 35 : width}%` }} />
      </span>
    </button>
  );
}

export function TimingMetrics({ dwellMinutes, waitingMinutes, isLoading = false, formatDuration, onOpenDetails }: TimingMetricsProps) {
  const metrics: TimingMetric[] = [
    {
      label: "Average dwell time",
      value: formatDuration(dwellMinutes),
      loading: isLoading,
      detail: "Request to linehaul trip entry",
      context: "Departure",
      icon: <Clock3 size={18} aria-hidden="true" />,
      accent: "lime",
      minutes: dwellMinutes,
    },
    {
      label: "Average waiting time",
      value: formatDuration(waitingMinutes),
      loading: isLoading,
      detail: "Request to FTE MM plate assignment",
      context: "Plate assigned",
      icon: <Truck size={18} aria-hidden="true" />,
      accent: "teal",
      minutes: waitingMinutes,
    },
  ];
  const maxMinutes = Math.max(...metrics.map(({ minutes }) => minutes ?? 0), 0);

  return (
    <section className="mb-[clamp(1rem,1.5vw,1.4rem)] overflow-hidden rounded-[.9rem] border border-soc5-line bg-linehaul-surface-soft p-2.5" aria-label="Request timing metrics">
      <div className="flex items-end justify-between gap-4 px-1 pb-2.5 max-[600px]:items-start max-[600px]:flex-col max-[600px]:gap-1">
        <div>
          <p className="m-0 text-[.68rem] font-bold uppercase tracking-[.12em] text-linehaul-lime-ink">Process timing</p>
          <h2 className="m-0 mt-1 text-sm font-semibold text-soc5-ink">Where requests spend time</h2>
        </div>
        <p className="m-0 max-w-[18rem] text-right text-xs leading-snug text-soc5-muted max-[600px]:text-left">Average elapsed time across the selected date range.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[600px]:grid-cols-1">
        {metrics.map((metric) => <TimingCard key={metric.label} metric={metric} maxMinutes={maxMinutes} onOpenDetails={onOpenDetails} />)}
      </div>
    </section>
  );
}
