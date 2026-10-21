import type { TruckRequest } from "../../types";
import { RequestCancellationRemarks } from "./RequestCancellationRemarks";
import {
  displayRequestActor,
  displayRequestValue as displayValue,
  formatRequestDetailDateTime as formatDetailDateTime,
} from "./requestPresentation";

function formatCluster(value: string) {
  return value
    .split(",")
    .map((cluster) => cluster.trim())
    .filter(Boolean)
    .join(" · ");
}

function expandedRequestGroups(
  row: TruckRequest,
  visibleColumns: readonly string[],
) {
  const groups = [
    {
      fields: [
        {
          key: "backlogsTime",
          label: "Backlogs Time Stamp",
          value: formatDetailDateTime(row.backlogs_timestamp),
        },
        {
          key: "provideTime",
          label: "Provide Time",
          value: formatDetailDateTime(row.provide_time),
        },
        {
          key: "assignedTime",
          label: "Assigned Time",
          value: formatDetailDateTime(row.driver_assigned_at),
        },
      ],
    },
    {
      fields: [
        {
          key: "opsFte",
          label: "SOC PIC · FTE Ops",
          value: displayValue(row.ob_fte_name ?? row.ob_fte),
        },
        {
          key: "mmFte",
          label: "MM FTE",
          value: displayRequestActor(row.mm_fte_name, row.mm_fte_id),
        },
        {
          key: "opsPic",
          label: "OPS PIC",
          value: displayValue(row.ob_fte_name ?? row.ob_fte),
        },
      ],
    },
    {
      fields: [
        {
          key: "lhTypeRequest",
          label: "Truck Type",
          value: displayValue(row.truck_type),
        },
        {
          key: "lhTypeInput",
          label: "LH Type (input by FTE MM)",
          value: "Same as Truck Type",
        },
        {
          key: "docOfficer",
          label: "Doc Officer",
          value: displayRequestActor(row.doc_officer_name, row.doc_officer_id),
        },
      ],
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter(({ key }) => !visibleColumns.includes(key)),
    }))
    .filter((group) => group.fields.length > 0);
}

export function RequestExpandedDetails({
  request,
  visibleColumns,
}: {
  request: TruckRequest;
  visibleColumns: readonly string[];
}) {
  return (
    <section
      className="col-span-full min-w-0 w-full max-w-full overflow-x-hidden border-b border-soc5-line border-l-2 border-l-[#a2c500] bg-linehaul-surface-soft px-5 py-3 text-xs text-soc5-ink"
      aria-label={`Expanded details for request ${request.id}`}
    >
      <div className="grid w-full min-w-0 max-w-full gap-3 overflow-x-hidden">
        <dl>
          <div className="border-b border-soc5-line pb-3">
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-soc5-muted">
              Cluster
            </dt>
            <dd className="wrap-break-word text-base font-bold leading-6 tracking-normal text-soc5-ink">
              {formatCluster(request.cluster)}
            </dd>
          </div>
        </dl>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(13rem,100%),1fr))] gap-3 overflow-x-hidden pt-3">
          {expandedRequestGroups(request, visibleColumns).map(({ fields }) => (
            <section className="min-w-0" key={fields[0]?.key}>
              <dl className="grid gap-2">
                {fields.map(({ key, label, value }) => (
                  <div
                    className="min-w-0 border-b border-soc5-line pb-2"
                    key={key}
                  >
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-soc5-muted">
                      {label}
                    </dt>
                    <dd className="wrap-break-word text-xs font-medium leading-4 text-soc5-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <RequestCancellationRemarks remarks={request.cancellation_remarks} />
      </div>
    </section>
  );
}
