import type { FormEvent } from "react";
import { X } from "lucide-react";
import { AccessibleDialog } from "../AccessibleDialog";
import { Modal } from "../Modal";
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
  requestDrawerFieldsClass,
  requestDrawerHeaderClass,
  requestDrawerProfileClass,
  requestDrawerCloseClass,
  requestRejectClass,
  secondaryButtonClass,
} from "../../lib/uiClasses";
import {
  displayRequestValue,
  formatRequestDetailDateTime,
} from "./requestPresentation";
import { StatusBadge } from "../StatusBadge";
import type { TruckRequest } from "../../types";

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
          <StatusBadge status={request.status} uppercase />
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
}: {
  request: TruckRequest;
  returnFocus?: HTMLElement | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (remarks: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(String(data.get("rejection_remarks") ?? ""));
  }

  return (
    <Modal
      returnFocus={returnFocus}
      open
      onClose={onClose}
      className={compactFormDialogClass}
      role="dialog"
      ariaLabelledBy="outbound-reject-title"
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-bold tracking-wider uppercase">
            FTE Ops action
          </p>
          <h2 id="outbound-reject-title">Reject request</h2>
          <p>{request.id}</p>
        </div>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        <label className={dialogLabelClass}>
          Rejection remarks
          <textarea
            className={dialogTextareaClass}
            name="rejection_remarks"
            required
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
            {busy ? "Rejecting…" : "Reject request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
