import { type ReactNode } from "react";
import { cn } from "../lib/utils";
import { AccessibleDialog } from "./AccessibleDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  portal?: boolean;
  returnFocus?: HTMLElement | null;
};

export function Modal({
  open,
  onClose,
  children,
  className = "",
  ariaLabelledBy,
  ariaLabel,
  portal = true,
  returnFocus,
}: Props) {
  return (
    <AccessibleDialog
      open={open}
      label={ariaLabel ?? "Dialog"}
      labelledBy={ariaLabelledBy}
      onClose={onClose}
      portal={portal}
      dismissOnOutside={false}
      returnFocus={returnFocus}
      overlayClassName="shared-modal-overlay fixed inset-0 z-60 grid place-items-center bg-[rgb(11_24_25_/_43%)] p-[clamp(16px,4vw,40px)] backdrop-blur-[7px] animate-[dialog-backdrop-in_.2s_ease-out_both] motion-reduce:animate-none max-[640px]:items-end max-[640px]:p-3 max-[480px]:p-2.5"
      className={cn(
        "max-h-[min(760px,calc(100dvh-32px))] w-[min(1100px,100%)] overflow-hidden rounded-[20px] border border-soc5-line bg-soc5-panel text-soc5-ink shadow-[0_28px_70px_rgb(10_30_31_/_0.2),0_5px_18px_rgb(10_30_31_/_0.08)] outline-none animate-[dialog-panel-in_.34s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none max-[640px]:max-h-[calc(100dvh-24px)] max-[640px]:rounded-2xl",
        className,
      )}
    >
      {children}
    </AccessibleDialog>
  );
}
