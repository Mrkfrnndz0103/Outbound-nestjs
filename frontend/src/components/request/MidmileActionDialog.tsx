import { Truck, X } from "lucide-react";
import type { FormEvent } from "react";
import { buildMidmileAssignmentPayload } from "../../lib/requests";
import {
  compactFormDialogClass,
  dialogActionsClass,
  dialogFormClass,
  dialogHeadClass,
  dialogInputClass,
  dialogLabelClass,
  dialogTextareaClass,
  formErrorClass,
  iconButtonClass,
  secondaryButtonClass,
} from "../../lib/uiClasses";
import type { WorkflowAction } from "../../lib/workflow";
import type { TruckRequest } from "../../types";
import { Modal } from "../Modal";

type MmAction = Extract<WorkflowAction, "assign-truck" | "reject-mm">;

export function MidmileActionDialog({
  selection,
  returnFocus,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  selection: { request: TruckRequest; action: MmAction };
  returnFocus?: HTMLElement | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const confirming = selection.action === "assign-truck";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(
      confirming
        ? buildMidmileAssignmentPayload(data)
        : { rejection_remarks: data.get("rejection_remarks") },
    );
  }

  return (
    <Modal
      returnFocus={returnFocus}
      open
      onClose={onClose}
      className={compactFormDialogClass}
      ariaLabelledBy="action-title"
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-bold tracking-wider uppercase">
            {selection.request.cluster}
          </p>
          <h2 id="action-title">
            {confirming ? "Assign truck" : "Reject request"}
          </h2>
        </div>
        <button
          className={iconButtonClass}
          type="button"
          title="Close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        {confirming ? (
          <>
            <label className={dialogLabelClass}>
              Plate number
              <input
                className={dialogInputClass}
                name="plate_number"
                required
                maxLength={30}
              />
            </label>
            <label className={dialogLabelClass}>
              Truck size
              <select
                className={dialogInputClass}
                name="truck_size"
                defaultValue={selection.request.truck_size}
              >
                <option>4W</option>
                <option>4WAUV</option>
                <option>4WCV</option>
                <option>6W</option>
                <option>10W</option>
                <option>6WF</option>
              </select>
            </label>
            <label className={dialogLabelClass}>
              Truck type
              <select
                className={dialogInputClass}
                name="truck_type"
                defaultValue={selection.request.truck_type}
              >
                <option>WETLEASE</option>
                <option>DRYLEASE</option>
              </select>
            </label>
          </>
        ) : (
          <label className={dialogLabelClass}>
            Rejection remarks
            <textarea
              className={dialogTextareaClass}
              name="rejection_remarks"
              required
              rows={4}
            />
          </label>
        )}
        {error && <p className={formErrorClass}>{error}</p>}
        <div className={dialogActionsClass}>
          <button
            className={secondaryButtonClass}
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? (
              "Saving..."
            ) : confirming ? (
              <>
                <Truck size={17} />
                Assign truck
              </>
            ) : (
              "Reject request"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
