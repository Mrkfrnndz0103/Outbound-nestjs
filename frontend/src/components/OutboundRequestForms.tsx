import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@headlessui/react";
import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  buildRequestPayload,
  type RequestPayload,
} from "../lib/requests";
import { api } from "../lib/api";
import type { ClusterLookup, TruckRequest } from "../types";
import { inlineActionsClass, inlineCreateFormClass, inlineCreateInputClass, inlineCreateLabelClass, inlinePrimaryButtonClass, inlineSuggestionClass, inlineSuggestionsClass, secondaryButtonClass } from "../lib/uiClasses";

export function InlineCreateRow({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
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
    queryFn: () =>
      api<{ data: ClusterLookup[] }>(
        `/clusters?search=${encodeURIComponent(clusterSearch)}`,
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
          <Combobox.Options as="div" className={inlineSuggestionsClass}>
            {searchIsCurrent &&
              clusterSearch.length >= 3 &&
              lookup.isFetching &&
              !lookup.data && <p>Searching...</p>}
            {searchIsCurrent && lookup.isError && (
              <p>Unable to load clusters.</p>
            )}
            {searchIsCurrent && lookup.data && !lookup.isFetching && (
              lookup.data.data.length ? (
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
              )
            )}
          </Combobox.Options>
        </Combobox>
      </label>
      <label className={inlineCreateLabelClass}>
        Region
        <input className={inlineCreateInputClass} name="region" required readOnly value={selected?.region ?? ""} />
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
        <select className={inlineCreateInputClass} name="truck_size" defaultValue="6W">
          <option>4W</option>
          <option>4WAUV</option>
          <option>4WCV</option>
          <option>6W</option>
          <option>10W</option>
          <option>6WF</option>
        </select>
      </label>
      {error && (
        <p className="error notice text-[var(--color-danger)]">{error}</p>
      )}
      <div className={inlineActionsClass}>
        <button className={secondaryButtonClass} type="button" onClick={onCancel}>
          <X size={15} />
          Cancel
        </button>
        <button className={inlinePrimaryButtonClass} type="submit" disabled={busy || !selected}>
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
  onCancel,
  onSubmit,
}: {
  request: TruckRequest;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (payload: RequestPayload) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(buildRequestPayload(new FormData(event.currentTarget)));
  }

  return (
    <form className={inlineCreateFormClass} onSubmit={submit}>
      <label className={inlineCreateLabelClass}>
        Cluster
        <input
          className={inlineCreateInputClass}
          name="cluster"
          required
          maxLength={120}
          defaultValue={request.cluster}
        />
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
      </label>
      <label className={inlineCreateLabelClass}>
        Truck Size
        <select className={inlineCreateInputClass} name="truck_size" defaultValue={request.truck_size}>
          <option>4W</option>
          <option>6W</option>
          <option>10W</option>
          <option>6WF</option>
        </select>
      </label>
      <label className={inlineCreateLabelClass}>
        Truck Type
        <select className={inlineCreateInputClass} name="truck_type" defaultValue={request.truck_type}>
          <option>WETLEASE</option>
          <option>DRYLEASE</option>
        </select>
      </label>
      {error && (
        <p className="error notice text-[var(--color-danger)]">{error}</p>
      )}
      <div className={inlineActionsClass}>
        <button className={secondaryButtonClass} type="button" onClick={onCancel}>
          <X size={15} />
          Cancel
        </button>
        <button className={inlinePrimaryButtonClass} type="submit" disabled={busy}>
          <Save size={15} />
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
