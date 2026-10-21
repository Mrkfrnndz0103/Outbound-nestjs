import { ReactNode } from "react";
import { loginModalCardClass, loginModalLayerClass } from "../../lib/uiClasses";
import { AccessibleDialog } from "../AccessibleDialog";
import { AmbientGlows } from "./AmbientGlows";
import { FooterBar } from "./FooterBar";
import { QrPanel } from "./QrPanel";
import { Reveal } from "./Reveal";

interface LoginCardProps {
  children: ReactNode;
  beforeAuthentication?: ReactNode;
  modal?: boolean;
  visible?: boolean;
}

export function LoginCard({
  children,
  beforeAuthentication,
  modal = false,
  visible = true,
}: LoginCardProps) {
  if (modal) {
    return (
      <AccessibleDialog
        open={visible}
        label="Sign in to SOC 5 Outbound"
        describedBy="login-dialog-description"
        dismissible={false}
        overlayClassName={loginModalLayerClass}
        className={loginModalCardClass}
      >
        <div className="relative grid min-w-0 lg:grid-cols-2">
          <p id="login-dialog-description" className="sr-only">
            Choose a sign-in method for the SOC 5 Outbound operations workspace.
          </p>
          <QrPanel enabled={visible} compact />
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 hidden w-px bg-white/10 lg:block"
          />
          <section className="min-w-0 border-t border-white/10 bg-[rgb(19_30_39_/_48%)] px-4 py-5 sm:px-6 sm:py-7 lg:border-l lg:border-t-0">
            <Reveal delay={140} className="mx-auto block w-full max-w-[360px]">
              {beforeAuthentication}
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="mb-4 font-display text-sm font-semibold text-auth-ink">
                  Sign in to your operations workspace
                </p>
                {children}
              </div>
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
