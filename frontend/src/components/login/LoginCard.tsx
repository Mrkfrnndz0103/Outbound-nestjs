import { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { loginModalCardClass, loginModalLayerClass } from "../../lib/uiClasses";
import { AccessibleDialog } from "../AccessibleDialog";
import { AmbientGlows } from "./AmbientGlows";
import { FooterBar } from "./FooterBar";
import { QrPanel } from "./QrPanel";
import { Reveal } from "./Reveal";

interface LoginCardProps {
  children: ReactNode;
  modal?: boolean;
  visible?: boolean;
}

export function LoginCard({
  children,
  modal = false,
  visible = true,
}: LoginCardProps) {
  if (modal) {
    return (
      <AccessibleDialog
        open={visible}
        label="Sign in to SOC 5 Outbound"
        dismissible={false}
        overlayClassName={loginModalLayerClass}
        className={`${loginModalCardClass} translate-y-0 opacity-100 animate-login-modal-enter motion-reduce:animate-none`}
      >
        <div className="relative grid lg:grid-cols-[.92fr_1.08fr]">
          <QrPanel enabled={visible} compact />
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-auth-line lg:block"
          />
          <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 font-display text-xs font-semibold tracking-widest text-auth-muted backdrop-blur-md">
              OR
            </span>
          </div>
          <section className="flex items-center justify-center border-white/10 bg-white/[0.045] px-4 py-5 lg:border-l sm:px-6 sm:py-6">
            <Reveal delay={140} className="w-full max-w-[330px]">
              <div className="mb-5 flex items-center gap-2.5 border-b border-auth-line pb-4">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-auth-accent/15 text-auth-link ring-1 ring-auth-accent/30">
                  <ShieldCheck className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <div>
                  <p className="font-display text-xs font-semibold tracking-tight text-auth-ink">
                    Secure workspace
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-auth-faint">
                    Authorized operations access
                  </p>
                </div>
              </div>
              {children}
            </Reveal>
          </section>
        </div>
        <FooterBar compact />
      </AccessibleDialog>
    );
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-linear-to-br from-auth-page via-auth-page to-auth-page-2 px-4 py-6">
      <AmbientGlows />

      <main className="relative w-full max-w-[860px] overflow-hidden rounded-2xl border border-white/20 bg-white/[0.08] shadow-[0_30px_70px_-28px_rgba(14,24,54,0.65)] backdrop-blur-2xl">
        <div className="relative grid lg:grid-cols-[1fr_1fr]">
          {/* Left panel - QR Panel */}
          <QrPanel />

          {/* Vertical divider */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-auth-line lg:block"
          />
          <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 font-display text-xs font-semibold tracking-widest text-auth-muted backdrop-blur-md">
              OR
            </span>
          </div>

          {/* Mobile divider */}
          <div className="flex items-center gap-3 px-5 lg:hidden">
            <span className="h-px flex-1 bg-auth-line" />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 font-display text-xs font-semibold tracking-widest text-auth-muted">
              OR
            </span>
            <span className="h-px flex-1 bg-auth-line" />
          </div>

          {/* Right panel - Form */}
          <section className="flex items-center justify-center px-5 py-7 sm:px-7">
            <Reveal delay={140} className="w-full max-w-[330px]">
              {children}
            </Reveal>
          </section>
        </div>

        {/* Footer bar */}
        <FooterBar />
      </main>
    </div>
  );
}
