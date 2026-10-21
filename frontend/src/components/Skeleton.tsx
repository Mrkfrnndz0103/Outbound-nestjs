import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  requestSkeletonCellClass,
  requestSkeletonClass,
  requestSkeletonRowClass,
} from "../lib/uiClasses";

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="grid gap-0"
      role="status"
      aria-label="Loading list"
      aria-busy="true"
    >
      {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
        <div
          className="flex min-h-[62px] items-center gap-3 border-b border-soc5-line py-2.5"
          key={index}
        >
          <Skeleton className="h-[34px] w-[34px] flex-none rounded-full" />
          <span className="grid flex-1 gap-[7px]">
            <Skeleton
              className="h-2.5"
              style={{ width: `${58 + (index % 3) * 10}%` }}
            />
            <Skeleton
              className="h-2.5 opacity-[.62]"
              style={{ width: `${38 + (index % 2) * 14}%` }}
            />
          </span>
          <Skeleton className="h-2.5 w-[56px] max-w-[72px] shrink-0 basis-14" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardList({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="grid gap-3"
      role="status"
      aria-label="Loading cards"
      aria-busy="true"
    >
      {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
        <article
          className="grid min-h-[138px] gap-2.5 rounded-card border border-card-line bg-card-surface p-4"
          key={index}
        >
          <Skeleton className="h-3 w-[34%] rounded-[.3rem]" />
          <Skeleton
            className="h-[18px]"
            style={{ width: `${72 - (index % 2) * 8}%` }}
          />
          <Skeleton className="h-2.5 w-[52%] opacity-[.62]" />
          <div className="mt-auto flex justify-between gap-3">
            <Skeleton className="h-2.5 w-[72px] max-w-[72px]" />
            <Skeleton className="h-2.5 w-[48px] max-w-[72px]" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function SkeletonStatus({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-px" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{children ?? "Loading content"}</span>
    </div>
  );
}

export function SkeletonRequestTable({
  rows = 5,
  columns = 11,
}: {
  rows?: number;
  columns?: number;
}) {
  const columnCount = Math.max(1, columns);
  const columnWidths = [72, 82, 58, 64, 48, 76, 55];

  return (
    <div
      className={requestSkeletonClass}
      role="status"
      aria-label="Loading requests"
      aria-busy="true"
    >
      {Array.from({ length: Math.max(1, rows) }).map((_, rowIndex) => (
        <div className={requestSkeletonRowClass} key={rowIndex}>
          {Array.from({ length: columnCount }).map((_, columnIndex) => {
            const width =
              columnWidths[(rowIndex + columnIndex) % columnWidths.length];
            const isActionsColumn = columnIndex === columnCount - 1;

            return (
              <span className={requestSkeletonCellClass} key={columnIndex}>
                {isActionsColumn ? (
                  <Skeleton className="h-5 w-5 rounded-[5px]" />
                ) : columnIndex === 0 ? (
                  <>
                    <Skeleton className="h-[13px] w-[13px] rounded-full" />
                    <Skeleton
                      className="h-[18px] rounded-full"
                      style={{ width: `${width}%` }}
                    />
                  </>
                ) : (
                  <Skeleton className="h-2.5" style={{ width: `${width}%` }} />
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
