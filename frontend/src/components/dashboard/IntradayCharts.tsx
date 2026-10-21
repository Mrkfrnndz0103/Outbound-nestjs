import { CalendarDays } from "lucide-react";
import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  chartGridLineClass,
  chartHoverStateClass,
  chartPointGroupClass,
  chartXLabelClass,
  chartYLabelClass,
  intradayDateIconClass,
  intradayFiltersClass,
  intradayKpiAccentClass,
  intradayKpiClass,
  intradayKpiLabelClass,
  intradayKpiSuffixClass,
  intradayKpiValueClass,
  intradayLiveDotClass,
  intradayLiveLabelClass,
  intradayLiveStatusClass,
  lineAreaClass,
  lineChartClass,
  lineChartSvgClass,
  lineStrokeClass,
} from "../../lib/uiClasses";

export type IntradayChartPoint = {
  label: string;
  hour: number;
  count: number;
  x: number;
  y: number;
};

export function IntradayDateSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset
      className={intradayFiltersClass}
      aria-label="Intraday dispatch date"
    >
      <label className="sr-only" htmlFor="intraday-date-filter">
        Intraday dispatch date
      </label>
      <span className={intradayDateIconClass} aria-hidden="true">
        <CalendarDays size={16} strokeWidth={2.1} />
      </span>
      <input
        id="intraday-date-filter"
        className="min-w-0 flex-1 rounded-[.5rem] border border-transparent bg-transparent px-1 text-xs font-bold text-soc5-ink outline-none focus:border-soc5-line focus:bg-soc5-panel focus:ring-[.2rem] focus:ring-[rgb(20_184_166_/_14%)] max-[600px]:w-full"
        type="date"
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </fieldset>
  );
}

export function IntradayKpi({
  label,
  loading,
  value,
  suffix,
  accent = false,
}: {
  label: string;
  loading: boolean;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className={intradayKpiClass}>
      <span className={intradayKpiLabelClass}>{label}</span>
      <strong
        className={`${intradayKpiValueClass}${accent ? ` ${intradayKpiAccentClass}` : ""}`}
      >
        {loading ? (
          <Skeleton className="h-9 w-[118px]" />
        ) : (
          <>
            {value}
            {suffix ? (
              <small className={intradayKpiSuffixClass}>{suffix}</small>
            ) : null}
          </>
        )}
      </strong>
    </div>
  );
}

export function IntradayLiveStatus({
  error,
  refreshing,
  refreshed,
  text,
}: {
  error: boolean;
  refreshing: boolean;
  refreshed: boolean;
  text: string;
}) {
  return (
    <span
      className={`${intradayLiveStatusClass}${error ? " text-status-danger-ink" : ""}`}
      aria-live="polite"
    >
      <i className={intradayLiveDotClass} aria-hidden="true" />
      <span>{text}</span>
      <b className={intradayLiveLabelClass}>
        {refreshing ? "Refreshing" : refreshed ? "Updated" : "Live"}
      </b>
    </span>
  );
}

export function IntradayLineChart({
  activePoint,
  area,
  formatHour,
  line,
  maximum,
  points,
  onActivePointChange,
}: {
  activePoint: IntradayChartPoint | null;
  area: string;
  formatHour: (hour: number) => string;
  line: string;
  maximum: number;
  points: IntradayChartPoint[];
  onActivePointChange: (point: IntradayChartPoint | null) => void;
}) {
  const tooltipX = activePoint
    ? activePoint.x > 540
      ? activePoint.x - 130
      : activePoint.x + 14
    : 0;
  const tooltipY = activePoint ? Math.max(18, activePoint.y - 58) : 0;
  return (
    <div className={lineChartClass}>
      <svg
        className={lineChartSvgClass}
        viewBox="0 0 700 200"
        role="img"
        aria-label="Intraday dispatch volume over a 24-hour period"
      >
        <desc>
          Line chart showing dispatch order volume from 6 AM through 5 AM.
        </desc>
        <defs>
          <linearGradient id="lineAreaTop" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b5d93f" stopOpacity=".16" />
            <stop offset="100%" stopColor="#b5d93f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[160, 112, 64].map((y) => (
          <line
            key={y}
            className={chartGridLineClass}
            x1="46"
            y1={y}
            x2="654"
            y2={y}
          />
        ))}
        <text className={chartYLabelClass} x="38" y="163">
          0
        </text>
        <text className={chartYLabelClass} x="38" y="115">
          {Math.round(maximum / 2).toLocaleString()}
        </text>
        <text className={chartYLabelClass} x="38" y="67">
          {maximum.toLocaleString()}
        </text>
        {area && <path className={lineAreaClass} d={area} />}
        <path className={lineStrokeClass} d={line} />
        {points.map((point, index) => {
          const active = activePoint?.hour === point.hour;
          const timeLabel = formatHour(point.hour);
          return (
            <Fragment key={point.label}>
              <g
                key={point.label}
                className={chartPointGroupClass}
                data-active={active || undefined}
              >
                <circle cx={point.x} cy={point.y} r="4.2" />
                {index % 3 === 0 && (
                  <text className={chartXLabelClass} x={point.x} y="184">
                    {timeLabel}
                  </text>
                )}
              </g>
              <foreignObject
                key={`${point.label}-control`}
                x={point.x - 16}
                y={point.y - 16}
                width="32"
                height="32"
              >
                <button
                  type="button"
                  aria-label={`${timeLabel}: ${point.count.toLocaleString()} dispatched orders`}
                  className="size-8 rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[#0ea69b]"
                  onBlur={() => onActivePointChange(null)}
                  onFocus={() => onActivePointChange(point)}
                  onClick={() => onActivePointChange(point)}
                  onMouseEnter={() => onActivePointChange(point)}
                  onMouseLeave={() => onActivePointChange(null)}
                />
              </foreignObject>
            </Fragment>
          );
        })}
        {activePoint ? (
          <g className={chartHoverStateClass}>
            <line x1={activePoint.x} y1="44" x2={activePoint.x} y2="160" />
            <circle cx={activePoint.x} cy={activePoint.y} r="5.2" />
            <rect x={tooltipX} y={tooltipY} width="118" height="44" rx="10" />
            <text x={tooltipX + 12} y={tooltipY + 18}>
              {formatHour(activePoint.hour)}
            </text>
            <text x={tooltipX + 12} y={tooltipY + 34}>
              {activePoint.count.toLocaleString()} orders
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
