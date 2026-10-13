import type { ReactNode } from "react";

type PanelProps = {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Panel({
  kicker,
  title,
  description,
  action,
  className = "",
  children,
}: PanelProps) {
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-card border border-card-line bg-card-surface shadow-card${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5">
        <div>
          <p className="mb-[3px] text-xs font-semibold tracking-wide text-linehaul-lime-ink uppercase">
            {kicker}
          </p>
          <h2 className="m-0 text-sm font-semibold text-card-heading">
            {title}
          </h2>
          <p className="mt-1 mb-0 text-xs leading-normal text-soc5-muted">
            {description}
          </p>
        </div>
        {action}
      </div>
      <div className="min-w-0 px-3.5 pt-3 pb-3.5">{children}</div>
    </article>
  );
}
