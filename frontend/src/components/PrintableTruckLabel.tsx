import { Printer, X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import type { TruckRequest } from "../types";
import {
  driverQrClass,
  iconButtonClass,
  printDialogClass,
  printPreviewClass,
  printToolbarActionsClass,
  printToolbarClass,
  printToolbarTitleClass,
  secondaryButtonClass,
  truckLabelClass,
  truckLabelDockClass,
  truckLabelDockTimeClass,
  truckLabelDriverClass,
  truckLabelImageClass,
  truckLabelLoadBaseClass,
  truckLabelLoadLeftClass,
  truckLabelLoadRightClass,
  truckLabelLoadSecondClass,
  truckLabelLoadSingleClass,
  truckLabelPlateClass,
  truckLabelValueClass,
} from "../lib/uiClasses";
import { Modal } from "./Modal";

type TemplateKind = "single" | "coload" | "triload";

const templateSrc: Record<TemplateKind, string> = {
  single: "/printable_templates/single_lh.jpg",
  coload: "/printable_templates/coload_lh.jpg",
  triload: "/printable_templates/triload_lh.jpg",
};

function requestedLoads(request: TruckRequest) {
  return request.cluster
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function templateKind(count: number): TemplateKind {
  if (count <= 1) return "single";
  if (count === 2) return "coload";
  return "triload";
}

function dockTime(request: TruckRequest) {
  if (!request.docked_time) return "";
  const date = new Date(request.docked_time);
  return Number.isNaN(date.getTime())
    ? request.docked_time
    : date.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function loadSlotClass(slot: string) {
  switch (slot) {
    case "load-single":
      return truckLabelLoadSingleClass;
    case "load-left":
    case "load-third":
      return slot === "load-third"
        ? "left-[4%] w-[21.2%]"
        : truckLabelLoadLeftClass;
    case "load-right":
    case "load-first":
      return slot === "load-first"
        ? "left-[51.1%] w-[21.2%]"
        : truckLabelLoadRightClass;
    case "load-second":
      return truckLabelLoadSecondClass;
    default:
      return "";
  }
}

function FittedLabelText({
  value,
  className = "h-full",
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = "";
      const maximum = Number.parseFloat(getComputedStyle(element).fontSize);
      if (!element.clientWidth || !element.clientHeight) return;
      const fits = () =>
        element.scrollWidth <= element.clientWidth + 1 &&
        element.scrollHeight <= element.clientHeight + 1;
      if (fits()) return;
      let low = 1;
      let high = maximum;
      for (let step = 0; step < 10; step += 1) {
        const size = (low + high) / 2;
        element.style.fontSize = `${size}px`;
        if (fits()) low = size;
        else high = size;
      }
      element.style.fontSize = `${Math.floor(low * 10) / 10}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener("beforeprint", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  }, [value]);
  return (
    <span
      ref={ref}
      data-label-text
      className={`block w-full content-center leading-[1.05] transition-none ${className}`}
    >
      {value}
    </span>
  );
}

function DriverQr({ value }: { value: string }) {
  if (!value.trim()) return null;
  return (
    <QRCodeSVG
      value={value}
      className={driverQrClass}
      size={128}
      level="M"
      marginSize={4}
      bgColor="#ffffff"
      fgColor="#000000"
      role="img"
      aria-label={`Driver ID QR ${value}`}
    />
  );
}

function loadSlots(kind: TemplateKind, values: string[]) {
  if (kind === "single")
    return [{ className: "load-single", value: values[0] ?? "" }];
  if (kind === "coload")
    return [
      // The source order is 1st load, 2nd load; the template boxes run right to left.
      { className: "load-left", value: values[1] ?? "" },
      { className: "load-right", value: values[0] ?? "" },
    ];
  return [
    // The source order is 1st, 2nd, 3rd; the template boxes run right to left.
    { className: "load-third", value: values[2] ?? "" },
    { className: "load-second", value: values[1] ?? "" },
    { className: "load-first", value: values[0] ?? "" },
  ];
}

export function PrintableTruckLabel({
  request,
  onClose,
  returnFocus,
}: {
  request: TruckRequest;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const clusterValues = requestedLoads(request);
  const kind = templateKind(clusterValues.length);

  return createPortal(
    <div className="truck-label-print-root">
      <Modal
        open
        portal={false}
        returnFocus={returnFocus}
        onClose={onClose}
        className={printDialogClass}
        ariaLabel="Printable truck label"
      >
        <div className={printToolbarClass}>
          <strong className={printToolbarTitleClass}>Printable LH label</strong>
          <div className={printToolbarActionsClass}>
            <button
              className={`${secondaryButtonClass} text-xs font-bold`}
              type="button"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print
            </button>
            <button
              className={iconButtonClass}
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={printPreviewClass}>
          <div className={truckLabelClass} data-truck-label>
            <img
              className={truckLabelImageClass}
              src={templateSrc[kind]}
              alt=""
            />
            <div
              data-label-field="plate"
              className={`${truckLabelValueClass} ${truckLabelPlateClass}`}
            >
              <FittedLabelText value={request.plate_number || ""} />
            </div>
            <div
              data-label-field="driver"
              className={`${truckLabelValueClass} ${truckLabelDriverClass}`}
            >
              <DriverQr value={request.driver_id || ""} />
              <FittedLabelText
                value={request.driver_id || ""}
                className="h-[28%]"
              />
            </div>
            <div
              data-label-field="dock"
              className={`${truckLabelValueClass} ${truckLabelDockClass}`}
            >
              <FittedLabelText value={request.dock_no} />
            </div>
            <div
              data-label-field="time"
              className={`${truckLabelValueClass} ${truckLabelDockTimeClass}`}
            >
              <FittedLabelText value={dockTime(request)} />
            </div>
            {loadSlots(kind, clusterValues).map((slot) => (
              <div
                key={slot.className}
                data-label-field={slot.className}
                className={`${truckLabelValueClass} ${truckLabelLoadBaseClass} ${loadSlotClass(slot.className)}`}
              >
                <FittedLabelText value={slot.value} />
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
