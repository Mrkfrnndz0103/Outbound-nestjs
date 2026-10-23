import { Combobox } from "@headlessui/react";
import { useQuery } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { buildRequestPayload, type RequestPayload } from "../lib/requests";
import {
  inlineActionsClass,
  inlineCreateFormClass,
  inlineCreateInputClass,
  inlineCreateLabelClass,
  inlinePrimaryButtonClass,
  inlineSuggestionClass,
  inlineSuggestionsClass,
  secondaryButtonClass,
} from "../lib/uiClasses";
import type { ClusterLookup, TruckRequest } from "../types";

export type FieldErrors = Record<string, string[]>;

function FieldError({ name, errors }: { name: string; errors?: FieldErrors }) {
  const message = errors?.[name]?.[0];
  return message ? (
    <span className="text-xs text-[var(--color-danger)]" role="alert">
      {message}
    </span>
  ) : null;
}

export function InlineCreateRow({
  busy,
  error,
  fieldErrors,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  onCancel: () => void;
  onSubmit: (payload: RequestPayload) => void;
}) {
  const [clusterText, setClusterText] = useState("");
  const [selected, setSelected] = useState<ClusterLookup | null>(null);
  const [debouncedClusterSearch, setDebouncedClusterSearch] = useState("");
  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedClusterSearch(clusterText.trim()),
      250,
    );
    return () => window.clearTimeout(timeoutId);
  }, [clusterText]);
  const clusterSearch = debouncedClusterSearch;
  const searchIsCurrent = clusterSearch === clusterText.trim();
  const lookup = useQuery({
    queryKey: ["clusters", clusterSearch],
    queryFn: ({ signal }) =>
      api<{ data: ClusterLookup[] }>(
        `/clusters?search=${encodeURIComponent(clusterSearch)}`,
        { signal },
      ),
    enabled: clusterSearch.trim().length >= 3,
  });

  function pick(cluster: ClusterLookup | null) {
    setSelected(cluster);
    setClusterText(cluster?.cluster_name ?? "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(buildRequestPayload(new FormData(event.currentTarget)));
  }

  return (
    <form className={inlineCreateFormClass} onSubmit={submit}>
      <label className={inlineCreateLabelClass} htmlFor="cluster-input">
        Cluster
        <Combobox value={selected} by="id" onChange={pick} nullable>
          <Combobox.Input
            id="cluster-input"
            className={inlineCreateInputClass}
            name="cluster"
            required
            maxLength={120}
            displayValue={() => clusterText}
            onChange={(event) => {
              setClusterText(event.target.value);
              setSelected(null);
            }}
            placeholder="Type 3 chars"
          />
          <FieldError name="cluster" errors={fieldErrors} />
          <Combobox.Options as="div" className={inlineSuggestionsClass}>
            {searchIsCurrent &&
              clusterSearch.length >= 3 &&
              lookup.isFetching &&
              !lookup.data && <p>Searching...</p>}
            {searchIsCurrent && lookup.isError && (
              <p>Unable to load clusters.</p>
            )}
            {searchIsCurrent &&
              lookup.data &&
              !lookup.isFetching &&
              (lookup.data.data.length ? (
                lookup.data.data.map((cluster) => (
                  <Combobox.Option
                    className={inlineSuggestionClass}
                    key={cluster.id}
                    value={cluster}
                    as="button"
                    type="button"
                  >
                    {({ active }) => (
                      <>
                        <strong>{cluster.cluster_name}</strong>
                        <span>
                          Dock {cluster.dock_number} / {cluster.region}
                        </span>
                        <span className="sr-only">
                          {active ? "Currently focused" : ""}
                        </span>
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p>No cluster found.</p>
              ))}
          </Combobox.Options>
        </Combobox>
      </label>
      <label className={inlineCreateLabelClass}>
        Region
        <input
          className={inlineCreateInputClass}
          name="region"
          required
          readOnly
          value={selected?.region ?? ""}
        />
        <FieldError name="region" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Dock No
        <input
          className={inlineCreateInputClass}
          name="dock_no"
          required
          maxLength={50}
          defaultValue={selected?.dock_number ?? ""}
          key={selected?.id ?? "dock"}
        />
        <FieldError name="dock_no" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Backlogs
        <input
          className={inlineCreateInputClass}
          name="backlogs"
          type="number"
          required
          readOnly
          min={0}
          value={selected?.backlogs ?? 0}
        />
        <FieldError name="backlogs" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Backlogs Timestamp
        <input
          className={inlineCreateInputClass}
          readOnly
          value={
            selected?.backlogs_ts
              ? new Date(selected.backlogs_ts).toLocaleString()
              : ""
          }
        />
        <input
          type="hidden"
          name="backlogs_timestamp"
          value={selected?.backlogs_ts ?? ""}
        />
      </label>
      <label className={inlineCreateLabelClass}>
        Truck Size
        <select
          className={inlineCreateInputClass}
          name="truck_size"
          defaultValue="6W"
        >
          <option>4W</option>
          <option>4WAUV</option>
          <option>4WCV</option>
          <option>6W</option>
          <option>10W</option>
          <option>6WF</option>
        </select>
        <FieldError name="truck_size" errors={fieldErrors} />
      </label>
      {error && (
        <p className="error notice text-[var(--color-danger)]">{error}</p>
      )}
      <div className={inlineActionsClass}>
        <button
          className={secondaryButtonClass}
          type="button"
          onClick={onCancel}
        >
          <X size={15} />
          Cancel
        </button>
        <button
          className={inlinePrimaryButtonClass}
          type="submit"
          disabled={busy || !selected}
        >
          <Save size={15} />
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export function InlineEditRow({
  request,
  busy,
  error,
  fieldErrors,
  onCancel,
  onSubmit,
  requireRemarks = false,
  layout = "inline",
}: {
  request: TruckRequest;
  busy: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  onCancel: () => void;
  onSubmit: (payload: RequestPayload) => void;
  requireRemarks?: boolean;
  layout?: "inline" | "dialog";
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const remarks = event.currentTarget.elements.namedItem("edit_remarks") as HTMLTextAreaElement | null;
    if (remarks) {
      remarks.setCustomValidity(remarks.value.trim() ? "" : "Enter edit remarks.");
      if (!remarks.reportValidity()) return;
    }
    onSubmit(buildRequestPayload(new FormData(event.currentTarget)));
  }

  return (
    <form className={layout === "dialog" ? "grid grid-cols-1 items-end gap-4" : inlineCreateFormClass} onSubmit={submit}>
      <label className={inlineCreateLabelClass}>
        Cluster
        <input
          className={inlineCreateInputClass}
          name="cluster"
          required
          maxLength={120}
          defaultValue={request.cluster}
        />
        <FieldError name="cluster" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Region
        <input
          className={inlineCreateInputClass}
          name="region"
          required
          maxLength={120}
          defaultValue={request.region}
        />
        <FieldError name="region" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Dock No
        <input
          className={inlineCreateInputClass}
          name="dock_no"
          required
          maxLength={50}
          defaultValue={request.dock_no}
        />
        <FieldError name="dock_no" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Backlogs
        <input
          className={inlineCreateInputClass}
          name="backlogs"
          type="number"
          required
          min={0}
          defaultValue={request.backlogs}
        />
        <FieldError name="backlogs" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Truck Size
        <select
          className={inlineCreateInputClass}
          name="truck_size"
          defaultValue={request.truck_size}
        >
          <option>4W</option>
          <option>4WAUV</option>
          <option>4WCV</option>
          <option>6W</option>
          <option>10W</option>
          <option>6WF</option>
        </select>
        <FieldError name="truck_size" errors={fieldErrors} />
      </label>
      <label className={inlineCreateLabelClass}>
        Truck Type
        <select
          className={inlineCreateInputClass}
          name="truck_type"
          defaultValue={request.truck_type}
        >
          <option>WETLEASE</option>
          <option>DRYLEASE</option>
        </select>
        <FieldError name="truck_type" errors={fieldErrors} />
      </label>
      {requireRemarks && (
        <label className={inlineCreateLabelClass}>
          Edit remarks
          <textarea name="edit_remarks" required maxLength={2000} rows={4}
            className={`${inlineCreateInputClass} h-auto! min-h-24`}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
          />
          <FieldError name="edit_remarks" errors={fieldErrors} />
        </label>
      )}
      {error && (
        <p className="error notice text-[var(--color-danger)]">{error}</p>
      )}
      <div className={inlineActionsClass}>
        <button
          className={secondaryButtonClass}
          type="button"
          onClick={onCancel}
        >
          <X size={15} />
          Cancel
        </button>
        <button
          className={inlinePrimaryButtonClass}
          type="submit"
          disabled={busy}
        >
          <Save size={15} />
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
