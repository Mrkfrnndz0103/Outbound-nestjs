import { Truck, Users } from "lucide-react";
import type { UserType } from "../../pages/Login";

const OPTIONS: { key: UserType; label: string; icon: typeof Users }[] = [
  { key: "fte", label: "FTE", icon: Users },
  { key: "backroom", label: "Backroom", icon: Truck },
];

interface UserTypeToggleProps {
  value: UserType;
  onChange: (value: UserType) => void;
}

export function UserTypeToggle({ value, onChange }: UserTypeToggleProps) {
  const index = OPTIONS.findIndex((o) => o.key === value);

  return (
    <div
      role="tablist"
      aria-label="Login as"
      className="relative grid grid-cols-2 gap-1 rounded-xl border border-auth-line bg-black/10 p-1.5 shadow-[inset_0_1px_0_rgb(255_255_255_/_6%)] backdrop-blur-sm"
    >
      {/* sliding indicator */}
      <span
        aria-hidden
        className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-lg bg-auth-accent shadow-[0_.35rem_.9rem_rgb(29_100_216_/_30%),inset_0_1px_0_rgb(255_255_255_/_18%)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((o) => {
        const active = o.key === value;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`relative z-10 flex h-9 items-center justify-center gap-1.5 rounded-lg font-display text-xs font-semibold transition-[color,transform] duration-200 active:scale-[.98] ${
              active ? "text-white" : "text-auth-faint hover:text-auth-ink"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.1} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
