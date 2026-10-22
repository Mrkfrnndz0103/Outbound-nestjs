import { X } from "lucide-react";
import type { FormEvent } from "react";
import {
  compactFormDialogClass,
  dialogActionsClass,
  dialogFormClass,
  dialogHeadClass,
  dialogLabelClass,
  dialogTextareaClass,
  formErrorClass,
  requestDrawerAvatarClass,
  requestDrawerBackdropClass,
  requestDrawerClass,
  requestDrawerCloseClass,
  requestDrawerFieldsClass,
  requestDrawerHeaderClass,
  requestDrawerProfileClass,
  requestRejectClass,
  secondaryButtonClass,
} from "../../lib/uiClasses";
import type { TruckRequest } from "../../types";
import { AccessibleDialog } from "../AccessibleDialog";
import { Modal } from "../Modal";
import { StatusBadge } from "../StatusBadge";
import { RequestDecisionRemarks } from "./RequestDecisionRemarks";
import {
  displayRequestValue,
  formatRequestDetailDateTime,
} from "./requestPresentation";

export function OutboundRequestDrawer({
  request,
  onClose,
  returnFocus,
}: {
  request: TruckRequest;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  return (
    <AccessibleDialog
      open
      label={`Details for request ${request.id}`}
      onClose={onClose}
      returnFocus={returnFocus}
      overlayClassName={requestDrawerBackdropClass}
      className={`${requestDrawerClass} text-soc5-ink`}
    >
      <div className={requestDrawerHeaderClass}>
        <div>
          <span className="lh-drawer-eyebrow">Request details</span>
          <h2>{request.id}</h2>
        </div>
        <button
          className={requestDrawerCloseClass}
          type="button"
          aria-label="Close request details"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className={requestDrawerProfileClass}>
        <div className={requestDrawerAvatarClass} aria-hidden="true">
          {request.cluster.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{request.cluster}</strong>
          <span>
            {request.region} · Dock {request.dock_no}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusBadge status={request.display_status ?? request.status} uppercase />
        </div>
      </div>
      <dl className={requestDrawerFieldsClass}>
        <div>
          <dt>Request time</dt>
          <dd>{formatRequestDetailDateTime(request.request_timestamp)}</dd>
        </div>
        <div>
          <dt>Backlogs</dt>
          <dd>{request.backlogs.toLocaleString()}</dd>
        </div>
        <div>
          <dt>LH size</dt>
          <dd>{request.truck_size}</dd>
        </div>
        <div>
          <dt>Truck type</dt>
          <dd>{request.truck_type}</dd>
        </div>
        <div>
          <dt>SOC PIC</dt>
          <dd>{displayRequestValue(request.ob_fte_name ?? request.ob_fte)}</dd>
        </div>
        <div>
          <dt>LH trip #</dt>
          <dd>{displayRequestValue(request.linehaul_trip_no)}</dd>
        </div>
        <div>
          <dt>Plate #</dt>
          <dd>{displayRequestValue(request.plate_number)}</dd>
        </div>
      </dl>
      <RequestDecisionRemarks rejectionRemarks={request.rejection_remarks} cancellationRemarks={request.cancellation_remarks} />
    </AccessibleDialog>
  );
}

export function OutboundRejectDialog({
  request,
  returnFocus,
  busy,
  error,
  onClose,
  onSubmit,
  action = "reject",
}: {
  request: TruckRequest;
  returnFocus?: HTMLElement | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (remarks: string) => void;
  action?: "reject" | "cancel";
}) {
  const cancelling = action === "cancel";
  const name = cancelling ? "cancellation_remarks" : "rejection_remarks";
  const title = cancelling ? "Cancel request" : "Reject request";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const remarks = String(data.get(name) ?? "").trim();
    const input = event.currentTarget.elements.namedItem(name) as HTMLTextAreaElement;
    input.setCustomValidity(remarks ? "" : "Enter remarks.");
    if (!input.reportValidity() || busy) return;
    onSubmit(remarks);
  }

  return (
    <Modal
      returnFocus={returnFocus}
      open
      onClose={() => { if (!busy) onClose(); }}
      className={compactFormDialogClass}
      ariaLabelledBy="outbound-reject-title"
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-bold tracking-wider uppercase">
            FTE Ops action
          </p>
          <h2 id="outbound-reject-title">{title}</h2>
          <p>{request.id}</p>
        </div>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        <label className={dialogLabelClass}>
          {cancelling ? "Cancellation remarks" : "Rejection remarks"}
          <textarea
            className={dialogTextareaClass}
            name={name}
            required
            maxLength={2000}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
            rows={4}
          />
        </label>
        {error && <p className={formErrorClass}>{error}</p>}
        <div className={dialogActionsClass}>
          <button
            className={secondaryButtonClass}
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className={requestRejectClass} type="submit" disabled={busy}>
            {busy ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function OutboundCancelDialog(props: Omit<Parameters<typeof OutboundRejectDialog>[0], "action">) {
  return <OutboundRejectDialog {...props} action="cancel" />;
}

