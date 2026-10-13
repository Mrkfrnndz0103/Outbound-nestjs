import { nextActionLabelFor } from "../lib/workflow";
import type { Role } from "../types";

export function NextActionText({ role }: { role?: Role | null }) {
  const label = nextActionLabelFor(role);

  return (
    <span className="inline-flex min-w-0 items-center text-xs font-semibold text-soc5-muted">
      <span className="truncate">{label}</span>
    </span>
  );
}
