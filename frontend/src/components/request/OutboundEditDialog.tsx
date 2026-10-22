import { Modal } from "../Modal";
import { InlineEditRow } from "../OutboundRequestForms";
import type { RequestPayload } from "../../lib/requests";
import type { TruckRequest } from "../../types";
import { compactFormDialogClass, dialogHeadClass } from "../../lib/uiClasses";

export function OutboundEditDialog({ request, busy, error, onClose, onSubmit, requireRemarks, returnFocus }: {
  request: TruckRequest;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: RequestPayload) => void;
  requireRemarks: boolean;
  returnFocus?: HTMLElement | null;
}) {
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} returnFocus={returnFocus}
      className={compactFormDialogClass} ariaLabelledBy="outbound-edit-title">
      <div className={dialogHeadClass}>
        <div><h2 id="outbound-edit-title">Edit request</h2><p>{request.id}</p></div>
      </div>
      <div className="min-h-0 overflow-auto p-4">
        <InlineEditRow request={request} busy={busy} error={error}
          requireRemarks={requireRemarks} onCancel={() => { if (!busy) onClose(); }} onSubmit={onSubmit} />
      </div>
    </Modal>
  );
}
