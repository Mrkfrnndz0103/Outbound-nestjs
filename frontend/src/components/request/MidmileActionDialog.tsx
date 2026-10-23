import { Truck, X } from "lucide-react";
import { type FormEvent, useRef } from "react";
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

export type MmAction = Extract<
  WorkflowAction,
  "assign-truck" | "reject-mm" | "cancel"
>;

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
  const assignmentTime = useRef<Date | null>(null);
  const confirming = selection.action === "assign-truck";
  const cancelling = selection.action === "cancel";
  const remarksField = cancelling
    ? "cancellation_remarks"
    : "rejection_remarks";
  const title = confirming
    ? "Assign truck"
    : cancelling
      ? "Cancel request"
      : "Reject request";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const remarks = String(data.get(remarksField) ?? "").trim();
    if (!confirming) {
      const input = event.currentTarget.elements.namedItem(
        remarksField,
      ) as HTMLTextAreaElement;
      input.setCustomValidity(remarks ? "" : "Enter remarks.");
      if (!input.reportValidity()) return;
    }
    onSubmit(
      confirming
        ? buildMidmileAssignmentPayload(data, assignmentTime.current ??= new Date())
        : { [remarksField]: remarks },
    );
  }

  return (
    <Modal
      returnFocus={returnFocus}
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      className={compactFormDialogClass}
      ariaLabelledBy="action-title"
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-bold tracking-wider uppercase">
            {selection.request.cluster}
          </p>
          <h2 id="action-title">{title}</h2>
        </div>
        <button
          className={iconButtonClass}
          type="button"
          title="Close"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
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
            {cancelling ? "Cancellation remarks" : "Rejection remarks"}
            <textarea
              className={dialogTextareaClass}
              name={remarksField}
              required
              maxLength={2000}
              onInput={(event) => event.currentTarget.setCustomValidity("")}
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
            disabled={busy}
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
              title
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
