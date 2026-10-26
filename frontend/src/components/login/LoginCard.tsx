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
        <div className="relative grid min-w-0 bg-[linear-gradient(135deg,#f4faf7_0%,#ffffff_58%)] lg:grid-cols-2">
          <p id="login-dialog-description" className="sr-only">
            Choose a sign-in method for the SOC 5 Outbound operations workspace.
          </p>
          <QrPanel enabled={visible} compact />
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 hidden w-px bg-auth-line lg:block"
          />
          <section className="min-w-0 border-t border-auth-line bg-white/75 px-4 py-4 sm:px-6 sm:py-6 lg:border-l lg:border-t-0 lg:px-8">
            <Reveal delay={140} className="mx-auto block w-full max-w-[360px]">
              <header className="mb-4">
                <p className="text-[.68rem] font-semibold uppercase tracking-[.16em] text-auth-faint">
                  Secure workspace
                </p>
                <p className="mt-1.5 font-display text-lg font-semibold tracking-tight text-auth-ink">
                  Welcome back
                </p>
              </header>
              {beforeAuthentication}
              <div className="mt-4 border-t border-auth-line pt-4">
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
    <div className="relative flex min-h-dvh items-start justify-center overflow-x-hidden bg-linear-to-br from-auth-page via-auth-page to-auth-page-2 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <AmbientGlows />

      <main className="relative w-full max-w-[900px] overflow-hidden rounded-2xl border border-white/20 bg-white/[0.08] shadow-[0_30px_70px_-28px_rgba(14,24,54,0.65)] backdrop-blur-2xl">
        <div className="relative grid lg:grid-cols-[1.08fr_.92fr]">
          <QrPanel />

          <div
            aria-hidden
            className="absolute inset-y-0 left-[54%] hidden w-px -translate-x-1/2 bg-auth-line lg:block"
          />

          <section
            aria-labelledby="login-heading"
            className="flex min-w-0 items-center justify-center px-5 py-6 sm:px-8 sm:py-8 lg:px-9"
          >
            <Reveal delay={140} className="w-full max-w-[350px]">
              <header className="mb-6">
                <div className="mb-5 flex items-center gap-3 lg:hidden">
                  <img
                    src="/dashboard-icon/icon_logo.png"
                    alt=""
                    className="size-11 shrink-0 rounded-xl object-cover shadow-lg shadow-auth-accent/30"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold tracking-tight text-auth-ink">
                      SOC 5 OUTBOUND
                    </p>
                    <p className="text-xs text-auth-muted">
                      Operations Management System
                    </p>
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-auth-faint">
                  Secure workspace
                </p>
                <h1
                  id="login-heading"
                  className="mt-2 font-display text-2xl font-semibold tracking-tight text-auth-ink"
                >
                  Welcome back
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-auth-muted">
                  Choose your account type, then sign in with your assigned
                  credentials.
                </p>
              </header>

              {beforeAuthentication && (
                <div className="mb-6">{beforeAuthentication}</div>
              )}
              {children}
            </Reveal>
          </section>
        </div>

        <FooterBar compact />
      </main>
    </div>
  );
}
