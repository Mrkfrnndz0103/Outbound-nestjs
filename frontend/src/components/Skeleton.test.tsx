import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRequestTable } from "./Skeleton";

describe("Skeleton", () => {
  it("renders the shadcn pulse placeholder", () => {
    const markup = renderToStaticMarkup(<Skeleton />);

    expect(markup).toContain('data-slot="skeleton"');
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("bg-accent");
  });

  it("forwards className and style to the placeholder", () => {
    const markup = renderToStaticMarkup(
      <Skeleton className="h-[18px] self-center" style={{ width: "62%" }} />,
    );

    expect(markup).toContain("h-[18px]");
    expect(markup).toContain("self-center");
    expect(markup).toContain("width:62%");
  });

  it("keeps request loading rows full-width and clipped to the table grid", () => {
    const markup = renderToStaticMarkup(
      <SkeletonRequestTable rows={1} columns={4} />,
    );

    expect(markup).toContain("col-span-full");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("overflow-hidden");
  });
});
