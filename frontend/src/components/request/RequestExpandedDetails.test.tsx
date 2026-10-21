import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequestExpandedDetails } from "./RequestExpandedDetails";

describe("RequestExpandedDetails", () => {
  it("renders only fields hidden from the table", () => {
    const markup = renderToStaticMarkup(
      <RequestExpandedDetails
        request={
          {
            cluster: "North Hub, South Hub",
            truck_type: "WETLEASE",
            ob_fte: "ops-1",
            ob_fte_name: "Ops One",
            mm_fte_id: "mm-1",
            mm_fte_name: "MM One",
            doc_officer_id: "doc-1",
            doc_officer_name: "Doc One",
          } as never
        }
        visibleColumns={["opsFte"]}
      />,
    );

    expect(markup).toContain("North Hub · South Hub");
    expect(markup).toContain("MM One");
    expect(markup).not.toContain("SOC PIC · FTE Ops");
  });
});
