import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  columns: number;
  rows?: number;
  compact?: boolean;
};

export function SkeletonTable({ columns, rows = 5, compact = false }: Props) {
  const columnCount = Math.max(1, columns);
  const rowCount = Math.max(1, rows);
  const gridClassName =
    "grid grid-cols-[repeat(var(--skeleton-cols),minmax(0,1fr))] gap-3";
  const cellHeightClass = compact ? "h-2.5" : "h-3";

  return (
    <div
      className="overflow-hidden rounded-card border border-card-line bg-card-surface shadow-card"
      role="status"
      aria-label="Loading table"
      aria-busy="true"
      style={{ ["--skeleton-cols" as string]: columnCount }}
    >
      <div
        className={`${gridClassName} border-b border-soc5-line bg-soc5-page/70 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
      >
        {Array.from({ length: columnCount }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-3 rounded-[.3rem]"
            style={{
              width:
                index === 0
                  ? "68%"
                  : index === columnCount - 1
                    ? "42%"
                    : `${54 + ((index * 13) % 28)}%`,
            }}
          />
        ))}
      </div>
      <div className="divide-y divide-soc5-line">
        {Array.from({ length: rowCount }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className={`${gridClassName} ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
          >
            {Array.from({ length: columnCount }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={[
                  cellHeightClass,
                  columnIndex === 0 ? "rounded-full" : "",
                  columnIndex === columnCount - 1 ? "max-w-[72px]" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
