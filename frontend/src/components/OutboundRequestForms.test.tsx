import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: undefined,
    isError: false,
    isFetching: false,
  }),
}));

import { InlineCreateRow } from "./OutboundRequestForms";

describe("InlineCreateRow", () => {
  it("renders the cluster lookup as an accessible combobox", () => {
    const markup = renderToStaticMarkup(
      <InlineCreateRow busy={false} onCancel={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
  });

  it("renders backend validation beside the affected field", () => {
    const markup = renderToStaticMarkup(
      <InlineCreateRow
        busy={false}
        fieldErrors={{ truck_size: ["Choose a supported truck size."] }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain("Choose a supported truck size.");
    expect(markup).toContain('role="alert"');
  });
});
