import {
  ArrowRight,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { loginShineButtonClass } from "../../lib/uiClasses";

interface BackroomLoginFormProps {
  opsId: string;
  password: string;
  busy: boolean;
  error: string;
  onOpsIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
}

export function BackroomLoginForm({
  opsId,
  password,
  busy,
  error,
  onOpsIdChange,
  onPasswordChange,
  onSubmit,
  onForgotPassword,
}: BackroomLoginFormProps) {
  const [shaking, setShaking] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestedOpsId, setRequestedOpsId] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 500);
    return () => window.clearTimeout(timer);
  }, [error]);

  async function submitAccessRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    setRequestBusy(true);
    try {
      await api("/access-requests", {
        method: "POST",
        body: JSON.stringify({
          name: requestName.trim(),
          ops_id: requestedOpsId.trim(),
        }),
      });
      setRequestSent(true);
    } catch (cause) {
      setRequestError(
        cause instanceof Error
          ? cause.message
          : "Unable to send the access request.",
      );
    } finally {
      setRequestBusy(false);
    }
  }

  if (requestOpen) {
    return (
      <form
        className="w-full animate-login-rise motion-reduce:animate-none"
        onSubmit={submitAccessRequest}
      >
        <h2 className="font-display text-base font-semibold text-auth-ink leading-snug tracking-tight">
          Request Backroom access
        </h2>
        <p className="mt-1.5 text-xs text-auth-muted leading-relaxed">
          An FTE user will review your details before creating an account.
        </p>
        <label
          htmlFor="access-request-name"
          className="mt-4 block text-sm font-medium text-auth-faint"
        >
          Full name
        </label>
        <input
          id="access-request-name"
          value={requestName}
          onChange={(event) => setRequestName(event.target.value)}
          required
          maxLength={120}
          className="mt-2 h-11 w-full rounded-xl border border-auth-line bg-black/10 px-3 text-base text-auth-ink outline-none transition-[border-color,background-color,box-shadow] focus:border-auth-accent focus:bg-white/[0.1] focus:ring-4 focus:ring-auth-accent/20"
        />
        <label
          htmlFor="access-request-ops-id"
          className="mt-3 block text-xs font-semibold uppercase tracking-wider text-auth-faint"
        >
          Requested Ops ID
        </label>
        <input
          id="access-request-ops-id"
          value={requestedOpsId}
          onChange={(event) =>
            setRequestedOpsId(event.target.value.toUpperCase())
          }
          placeholder="OPS123"
          required
          pattern="[Oo][Pp][Ss][0-9]+"
          maxLength={40}
          className="mt-2 h-11 w-full rounded-xl border border-auth-line bg-black/10 px-3 text-base uppercase text-auth-ink outline-none placeholder:text-auth-faint/75 transition-[border-color,background-color,box-shadow] focus:border-auth-accent focus:bg-white/[0.1] focus:ring-4 focus:ring-auth-accent/20"
        />
        {requestError && (
          <p className="mt-2 text-xs font-medium text-auth-danger leading-snug">
            {requestError}
          </p>
        )}
        {requestSent ? (
          <p className="mt-3 text-xs font-medium text-auth-success leading-snug">
            Request sent. An FTE user will review and create your account.
          </p>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={requestBusy}
              className="text-xs font-semibold text-auth-link disabled:opacity-50"
            >
              {requestBusy ? "Sending..." : "Send request"}
            </button>
            <button
              type="button"
              onClick={() => setRequestOpen(false)}
              className="text-xs font-semibold text-auth-muted hover:text-auth-ink"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="w-full animate-login-rise motion-reduce:animate-none"
    >
      <h2 className="font-display text-base font-semibold text-auth-ink leading-snug tracking-tight">
        Backroom sign in
      </h2>
      <p className="mt-1.5 text-xs text-auth-muted leading-relaxed">
        Use your assigned Ops ID and password.
      </p>

      {/* Ops ID */}
      <label
        htmlFor="backroom-ops-id"
        className="mt-4 block text-xs font-semibold uppercase tracking-wider text-auth-faint"
      >
        Ops ID
      </label>
      <div
        className={`mt-1.5 flex h-11 items-stretch rounded-xl border bg-slate-50 transition-all duration-200 focus-within:border-auth-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 ${
          shaking ? "animate-login-shake motion-reduce:animate-none" : ""
        } ${error ? "border-auth-danger/70" : "border-auth-line"}`}
      >
        <span className="grid w-10 shrink-0 place-items-center text-auth-faint">
          <IdCard className="h-4 w-4" />
        </span>
        <input
          value={opsId}
          onChange={(e) => onOpsIdChange(e.target.value.toUpperCase())}
          placeholder="SOC5-0000"
          id="backroom-ops-id"
          aria-label="Ops ID"
          autoComplete="username"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "backroom-login-error" : undefined}
          className="min-w-0 flex-1 bg-transparent pr-3 text-base tracking-wide text-auth-ink outline-none placeholder:text-auth-faint uppercase focus-visible:outline-none"
        />
      </div>

      <label
        htmlFor="backroom-password"
        className="mt-3.5 block text-xs font-semibold uppercase tracking-wider text-auth-faint"
      >
        Password
      </label>
      <div
        className={`mt-1.5 flex h-11 items-stretch rounded-xl border bg-slate-50 transition-all duration-200 focus-within:border-auth-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 ${
          shaking ? "animate-login-shake motion-reduce:animate-none" : ""
        } ${error ? "border-auth-danger/70" : "border-auth-line"}`}
      >
        <span className="grid w-10 shrink-0 place-items-center text-auth-faint">
          <KeyRound className="h-4 w-4" />
        </span>
        <input
          id="backroom-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          aria-label="Password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "backroom-login-error" : undefined}
          autoComplete="current-password"
          required
          className="min-w-0 flex-1 bg-transparent text-base tracking-wide text-auth-ink outline-none placeholder:text-auth-faint focus-visible:outline-none"
        />
        <button
          type="button"
          aria-label={showPassword ? "Hide secret" : "Reveal secret"}
          title={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((visible) => !visible)}
          className="grid w-10 shrink-0 place-items-center text-auth-faint transition-colors hover:text-auth-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-auth-accent/60"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p
          id="backroom-login-error"
          role="alert"
          className="mt-2.5 rounded-lg border border-auth-danger/25 bg-auth-danger/10 px-3 py-2 text-xs font-medium text-auth-danger leading-snug"
        >
          {error}
        </p>
      )}

      <div className="mt-3.5 flex items-center justify-between">
        <label className="group flex cursor-pointer items-center gap-2 text-xs font-medium text-auth-muted leading-snug">
          <input
            type="checkbox"
            className="sr-only"
            checked={keepSignedIn}
            onChange={(event) => setKeepSignedIn(event.target.checked)}
          />
          <span
            className={`grid h-4 w-4 place-items-center rounded border transition-all duration-200 group-focus-within:ring-2 group-focus-within:ring-auth-accent/60 ${
              keepSignedIn
                ? "border-auth-accent bg-auth-accent"
                : "border-auth-line bg-transparent"
            }`}
          >
            {keepSignedIn && (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path
                  d="M2.5 6.3 4.8 8.6 9.5 3.9"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          Keep me signed in
        </label>
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs font-semibold text-auth-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-accent/60 tracking-tight"
        >
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        disabled={busy}
        className={`${loginShineButtonClass} group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-auth-accent font-display text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-all duration-200 hover:bg-auth-accent-2 active:scale-[.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-70`}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-semibold">Signing in…</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Sign In</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </button>

      <p className="mt-3.5 text-center text-xs text-auth-muted leading-snug">
        Need an Ops ID?{" "}
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="font-semibold text-auth-link underline-offset-4 hover:underline tracking-tight"
        >
          Request access
        </button>
      </p>
    </form>
  );
}
