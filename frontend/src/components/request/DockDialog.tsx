import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import {
  compactFormDialogClass,
  dialogActionsClass,
  dialogFormClass,
  dialogHeadClass,
  dialogInputClass,
  dialogLabelClass,
  iconButtonClass,
  secondaryButtonClass,
} from "../../lib/uiClasses";
import type { WorkflowAction } from "../../lib/workflow";
import type { TruckRequest, User } from "../../types";
import { Modal } from "../Modal";

type DockAction = Extract<WorkflowAction, "mark-docked" | "reassign-driver">;

export function DockDialog({
  request,
  actorRole,
  action,
  busy,
  onClose,
  onSubmit,
}: {
  request: TruckRequest;
  actorRole: User["role"];
  action: DockAction;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [driverId, setDriverId] = useState("");
  const validDriverId = /^[0-9]{1,10}$/.test(driverId.trim());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(
      actorRole === "doc_officer"
        ? { driver_id: String(data.get("driver_id") ?? "").trim() }
        : { linehaul_trip_no: data.get("linehaul_trip_no") },
    );
  }

  const isDriverAction = actorRole === "doc_officer";
  const isReassignment = action === "reassign-driver";
  const title = isDriverAction
    ? `${isReassignment ? "Reassign" : "Assign"} Driver ID`
    : "Dock truck";

  return (
    <Modal
      open
      onClose={onClose}
      className={compactFormDialogClass}
      ariaLabel={
        isDriverAction
          ? `${title} for ${request.cluster}`
          : `Dock truck for ${request.cluster}`
      }
    >
      <div className={dialogHeadClass}>
        <div>
          <p className="mb-[0.35rem] text-linehaul-lime-ink text-xs font-semibold tracking-wide uppercase">
            {request.cluster}
          </p>
          <h2>{title}</h2>
        </div>
        <button
          className={iconButtonClass}
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        {isDriverAction ? (
          <>
            {isReassignment && (
              <p className="text-sm text-soc5-muted">
                Current Driver ID: {request.driver_id}. Enter the replacement
                Driver ID.
              </p>
            )}
            <label className={dialogLabelClass}>
              Driver ID
              <input
                name="driver_id"
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={dialogInputClass}
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label className={dialogLabelClass}>
            LH Trip Number
            <input
              name="linehaul_trip_no"
              required
              className={dialogInputClass}
              defaultValue={request.linehaul_trip_no ?? ""}
            />
          </label>
        )}
        <div className={dialogActionsClass}>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (isDriverAction && !validDriverId)}
          >
            {busy
              ? "Saving..."
              : isDriverAction
                ? isReassignment
                  ? "Reassigned"
                  : "Assigned"
                : "Docked"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
