import { MessageSquareText } from "lucide-react";
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

function BrandHeader() {
  return (
    <header className="relative flex w-full items-center justify-between px-5 pb-4 pt-6 sm:px-10 sm:pt-8">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-linear-to-tr from-[#0050cb] to-[#0084ff] text-white shadow-md shadow-blue-500/25">
          <MessageSquareText className="size-5" aria-hidden="true" />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-slate-900">
            SeaTalk
          </span>
          <span className="rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-auth-accent">
            Enterprise
          </span>
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-md sm:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        All operational systems online
      </div>
    </header>
  );
}

function AuthenticationCard({
  children,
  beforeAuthentication,
}: Pick<LoginCardProps, "children" | "beforeAuthentication">) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-5 sm:px-6">
      <section
        aria-labelledby="login-heading"
        className="w-full max-w-[840px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/60"
      >
        <Reveal className="border-b border-slate-100 px-6 py-5 sm:px-9">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select workspace access role
            </p>
            <div className="w-full sm:w-[310px]">{beforeAuthentication}</div>
          </div>
        </Reveal>

        <div className="grid items-stretch md:grid-cols-12">
          <section className="flex min-w-0 items-center px-6 py-7 sm:px-9 md:col-span-7">
            <Reveal delay={100} className="w-full">
              <header className="mb-5">
                <h1
                  id="login-heading"
                  className="text-2xl font-bold tracking-tight text-slate-900"
                >
                  Welcome back!
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Sign in to continue to the outbound operations workspace.
                </p>
              </header>
              {children}
            </Reveal>
          </section>
          <div className="border-t border-slate-200 bg-slate-50/55 md:col-span-5 md:border-l md:border-t-0">
            <QrPanel compact />
          </div>
        </div>
        <FooterBar compact />
      </section>
    </main>
  );
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
        className={`${loginModalCardClass} max-w-[840px] overflow-hidden bg-auth-page`}
      >
        <p id="login-dialog-description" className="sr-only">
          Choose a sign-in method for the SOC 5 Outbound operations workspace.
        </p>
        <AuthenticationCard beforeAuthentication={beforeAuthentication}>
          {children}
        </AuthenticationCard>
      </AccessibleDialog>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-auth-page text-slate-800">
      <AmbientGlows />
      <BrandHeader />
      <AuthenticationCard beforeAuthentication={beforeAuthentication}>
        {children}
      </AuthenticationCard>
      <footer className="relative px-5 pb-5 text-center text-[11px] text-slate-500 sm:px-10 sm:text-left">
        © 2026 SeaTalk Enterprise · Privacy · Terms · Security
      </footer>
    </div>
  );
}
