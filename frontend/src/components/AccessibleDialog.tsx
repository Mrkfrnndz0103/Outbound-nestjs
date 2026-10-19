import { Dialog } from "radix-ui";
import { type ReactNode, useRef } from "react";

type Props = {
  open: boolean;
  label: string;
  labelledBy?: string;
  describedBy?: string;
  portal?: boolean;
  dismissOnOutside?: boolean;
  children: ReactNode;
  className: string;
  overlayClassName: string;
  onClose?: () => void;
  dismissible?: boolean;
  returnFocus?: HTMLElement | null;
};

export function AccessibleDialog({
  open,
  label,
  labelledBy,
  describedBy,
  portal = true,
  dismissOnOutside = true,
  children,
  className,
  overlayClassName,
  onClose,
  dismissible = true,
  returnFocus,
}: Props) {
  const opener = useRef<HTMLElement | null>(null);

  const content = (
    <Dialog.Overlay className={overlayClassName}>
      <Dialog.Content
        asChild
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus ?? opener.current;
          if (target?.isConnected) target.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible || !dismissOnOutside) event.preventDefault();
        }}
      >
        <section className={className}>
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </section>
      </Dialog.Content>
    </Dialog.Overlay>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next && dismissible) onClose?.();
    }}>
      {portal ? <Dialog.Portal>{content}</Dialog.Portal> : content}
    </Dialog.Root>
  );
}
