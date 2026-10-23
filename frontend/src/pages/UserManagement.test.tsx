import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-query", () => ({
 useQuery: () => ({ data: { data: [{ id: "doc-1", name: "DOC recovery", role: "doc_officer", is_active: true }] } }),
 useQueryClient: () => ({ invalidateQueries: vi.fn() }),
 useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("../components/ui/skiper-ui/skiper87", () => ({ Skiper87: ({children}: {children: unknown}) => children }));
import { UserManagement } from "./UserManagement";
it("offers password recovery for active DOC officers", () => {
 expect(renderToStaticMarkup(<UserManagement />)).toContain('Reset password for DOC recovery');
});
