import { workspaceViewClass } from "../lib/uiClasses";

export function Kpi() {
  return (
    <section
      className={`${workspaceViewClass} kpi-view min-h-[calc(100dvh-76px)] items-center justify-center bg-[#202a30] p-0`}
      aria-label="KPI page under construction"
    >
      <img
        className="block h-auto max-h-[calc(100dvh-76px)] w-full object-contain"
        src="/image.png"
        alt="KPI page under construction"
      />
    </section>
  );
}
