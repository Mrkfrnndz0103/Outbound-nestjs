import { Lock, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";

function Icon24() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
      aria-hidden
    >
      <path d="M20.5 12a8.5 8.5 0 1 1-2.55-6.05" />
      <path d="M20.5 3.6v3.6h-3.6" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        24
      </text>
    </svg>
  );
}

const ITEMS = [
  {
    icon: <ShieldCheck className="h-[17px] w-[17px]" strokeWidth={2} />,
    title: "Secure & Protected",
    sub: "Your data is safe",
  },
  {
    icon: <Lock className="h-4 w-4" strokeWidth={2} />,
    title: "Authorized Access Only",
    sub: "For operations personnel",
  },
  {
    icon: <Icon24 />,
    title: "24/7 Operations",
    sub: "AI Chart Support",
  },
];

export function FooterBar({ compact = false }: { compact?: boolean }) {
  return (
    <footer className="grid grid-cols-1 divide-y divide-auth-line border-t border-auth-line bg-white/[0.04] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {ITEMS.map((item, i) => (
        <Reveal key={item.title} delay={i * 100}>
          <div className={`group flex h-full items-center ${compact ? "gap-1.5 px-2 py-1.5" : "gap-3 px-5 py-4"} transition-colors duration-300 hover:bg-white/[0.05] sm:justify-center`}>
            <span className={`grid ${compact ? "h-6 w-6" : "h-8 w-8"} shrink-0 place-items-center rounded-full bg-auth-accent/15 text-auth-link ring-1 ring-auth-accent/30 transition-all duration-300 group-hover:scale-105 group-hover:bg-auth-accent/25 group-hover:ring-auth-accent/55`}>
              {item.icon}
            </span>
            <div>
              <p className={`font-display ${compact ? "text-[10px]" : "text-xs"} font-semibold leading-tight text-auth-ink`}>
                {item.title}
              </p>
              <p className={`${compact ? "mt-0 text-[9px] leading-tight" : "mt-0.5 text-xs"} text-auth-faint`}>{item.sub}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </footer>
  );
}
