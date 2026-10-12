import { secondaryButtonClass } from "../../lib/uiClasses";

type Props = {
  hasData: boolean;
  fetching: boolean;
  previousFilters: boolean;
  error: Error | null;
  onRetry: () => void;
};

export function RequestFetchNotice({ hasData, fetching, previousFilters, error, onRetry }: Props) {
  if (error) {
    return (
      <div role="alert" className="flex min-w-0 basis-full flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger-ink/20 bg-status-danger-surface p-3 text-sm text-soc5-ink">
        <div className="min-w-0">
          <p className="font-semibold">
            {hasData ? "Couldn’t refresh requests. Showing the last successful results." : "Couldn’t load requests."}
          </p>
          <p className="mt-1 break-words text-xs">{error.message}</p>
        </div>
        <button type="button" className={secondaryButtonClass} disabled={fetching} onClick={onRetry}>
          {fetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  if (!fetching || !hasData) return null;
  return (
    <p role="status" className="basis-full rounded-lg border border-soc5-line bg-soc5-panel px-3 py-2 text-xs text-soc5-muted">
      {previousFilters
        ? "Updating results. Showing previous results until the new filters finish loading."
        : "Refreshing requests. Current results remain visible."}
    </p>
  );
}
