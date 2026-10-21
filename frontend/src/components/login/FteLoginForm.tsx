import { ArrowRight, AtSign, Loader2 } from "lucide-react";
import { loginShineButtonClass } from "../../lib/uiClasses";
import { OtpVerify } from "./OtpVerify";

interface FteLoginFormProps {
  email: string;
  code: string;
  codeSent: boolean;
  resendAfter: number;
  busy: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent, submittedCode?: string) => void;
  onResendCode: () => void;
  onGoogleSignIn: () => void;
  onBackToEmail: () => void;
  pendingAction?: "verify" | "resend";
}

export function FteLoginForm({
  email,
  code: _code,
  codeSent,
  resendAfter,
  busy,
  error,
  onEmailChange,
  onCodeChange,
  onSubmit,
  onResendCode,
  onGoogleSignIn,
  onBackToEmail,
  pendingAction,
}: FteLoginFormProps) {
  const handleOtpSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    otpCode: string,
  ) => {
    onCodeChange(otpCode);
    onSubmit(event, otpCode);
  };

  if (codeSent) {
    return (
      <OtpVerify
        destination={email}
        resendAfter={resendAfter}
        onBack={onBackToEmail}
        onDone={handleOtpSubmit}
        onResend={onResendCode}
        backLabel="Change email"
        busy={busy}
        error={error}
        pendingAction={pendingAction}
      />
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="w-full animate-login-rise motion-reduce:animate-none"
    >
      <h2 className="font-display text-base font-semibold text-auth-ink leading-snug tracking-tight">
        Continue with work email
      </h2>
      <p className="mt-1.5 text-xs text-auth-muted leading-relaxed">
        We'll send an OTP to your @spxexpress.com email — no password needed.
      </p>

      <label
        htmlFor="email-input"
        className="mt-4 block text-[.68rem] font-semibold uppercase tracking-[.14em] text-auth-faint"
      >
        Work Email
      </label>
      <div
        className={`mt-2 flex h-12 items-stretch rounded-xl border bg-black/10 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-auth-accent focus-within:bg-white/[0.1] focus-within:ring-4 focus-within:ring-auth-accent/20 ${error ? "border-auth-danger/70" : "border-auth-line"}`}
      >
        <span className="grid w-10 shrink-0 place-items-center text-auth-faint">
          <AtSign className="h-4 w-4" />
        </span>
        <input
          id="email-input"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="name@spxexpress.com"
          aria-label="Work email"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "fte-login-error" : undefined}
          autoComplete="email"
          className="min-w-0 flex-1 bg-transparent text-base text-auth-ink outline-none placeholder:text-auth-faint/75 focus-visible:outline-none"
        />
      </div>

      {error && (
        <p
          id="fte-login-error"
          role="alert"
          className="mt-2.5 rounded-lg border border-auth-danger/25 bg-auth-danger/10 px-3 py-2 text-xs font-medium text-auth-danger leading-snug"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`${loginShineButtonClass} group mt-4 flex h-[48px] min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-auth-accent font-display text-sm font-semibold text-white shadow-[0_.7rem_1.3rem_rgb(29_100_216_/_28%)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-auth-accent-2 hover:brightness-110 active:translate-y-0 active:scale-[.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-auth-accent/35 disabled:cursor-wait disabled:opacity-85 tracking-tight`}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-semibold">Sending OTP…</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Send OTP</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-auth-line" />
        <span className="text-xs font-semibold uppercase tracking-widest text-auth-faint">
          or
        </span>
        <div className="h-px flex-1 bg-auth-line" />
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={busy}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-auth-line bg-white/[0.06] font-display text-sm font-semibold text-auth-ink transition-all duration-300 hover:border-white/25 hover:bg-white/[0.11] active:scale-[.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-auth-accent/35 disabled:cursor-wait disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      <p className="mt-3 text-center text-xs text-auth-muted">
        By continuing you agree to the{" "}
        <a
          href="/privacy"
          className="font-semibold text-auth-link underline-offset-4 hover:underline"
        >
          Privacy Policy
        </a>{" "}
        &{" "}
        <a
          href="/terms"
          className="font-semibold text-auth-link underline-offset-4 hover:underline"
        >
          Terms of Use
        </a>
        .
      </p>
    </form>
  );
}
