import { isAuthError } from "@supabase/supabase-js";
import { KeyRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { BackroomLoginForm } from "../components/login/BackroomLoginForm";
import { FteLoginForm } from "../components/login/FteLoginForm";
import { LoginCard } from "../components/login/LoginCard";
import { UserTypeToggle } from "../components/login/UserTypeToggle";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { loginModalCardClass, loginModalLayerClass } from "../lib/uiClasses";

export type UserType = "fte" | "backroom";

const authErrorMessages: Record<string, string> = {
  email_address_not_authorized:
    "Email delivery is not configured for this address. Ask an administrator to enable custom SMTP in Supabase.",
  email_provider_disabled:
    "Email sign-in is disabled in Supabase Authentication settings.",
  otp_disabled:
    "Email OTP sign-in is disabled in Supabase Authentication settings.",
  signup_disabled:
    "First-time email sign-in is disabled in Supabase Authentication settings.",
  over_email_send_rate_limit:
    "Too many verification emails were requested. Wait before requesting another code.",
  over_request_rate_limit:
    "Too many sign-in requests were made. Wait a few minutes and try again.",
  otp_expired:
    "This verification code is invalid or expired. Request a new code.",
};

function describeAuthError(cause: unknown, fallback: string): string {
  if (isAuthError(cause)) {
    if (cause.code && authErrorMessages[cause.code])
      return authErrorMessages[cause.code];
    const message = cause.message.trim();
    if (message && message !== "{}") return message;
    if (cause.status && cause.status >= 500)
      return "Email authentication failed. Check the Supabase Auth logs and custom SMTP configuration.";
    if ("originalError" in cause)
      return describeAuthError(cause.originalError, fallback);
  }
  if (cause && typeof cause === "object") {
    const value = cause as Record<string, unknown>;
    const code = typeof value.code === "string" ? value.code : "";
    if (code && authErrorMessages[code]) return authErrorMessages[code];
    for (const key of ["message", "msg", "error_description", "error"]) {
      if (
        typeof value[key] === "string" &&
        value[key].trim() &&
        value[key].trim() !== "{}"
      )
        return value[key];
    }
  }
  if (
    cause instanceof Error &&
    cause.message.trim() &&
    cause.message.trim() !== "{}"
  )
    return cause.message;
  return fallback;
}

export function Login({
  modal = false,
  visible = true,
}: {
  modal?: boolean;
  visible?: boolean;
}) {
  const [type, setType] = useState<UserType>("fte");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [opsId, setOpsId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpPendingAction, setOtpPendingAction] = useState<"verify" | "resend">(
    "verify",
  );
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = window.setTimeout(
      () => setResendAfter((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendAfter]);

  function switchType(next: UserType) {
    setType(next);
    setForgotOpen(false);
    setError("");
    setCodeSent(false);
    setCode("");
    setPassword("");
    setResendAfter(0);
  }

  async function signInWithGoogle() {
    setError("");
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { hd: "spxexpress.com", prompt: "select_account" },
        },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setError(describeAuthError(cause, "Unable to sign in with Google."));
      setBusy(false);
    }
  }

  async function sendCode(normalizedEmail: string) {
    if (resendAfter > 0) return;
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    if (sendError) throw sendError;
    setCodeSent(true);
    setResendAfter(60);
  }

  async function resendCode() {
    if (busy) return;
    setError("");
    setOtpPendingAction("resend");
    setBusy(true);
    try {
      await sendCode(email.trim().toLowerCase());
    } catch (cause) {
      setError(describeAuthError(cause, "Unable to resend the code."));
    } finally {
      setBusy(false);
    }
  }

  function backToEmail() {
    if (busy) return;
    setCodeSent(false);
    setCode("");
    setError("");
    setResendAfter(0);
  }

  async function startBackroomSession(nextOpsId: string, nextPassword: string) {
    const normalizedOpsId = nextOpsId.trim().toLowerCase();
    if (!/^ops[0-9]+$/i.test(normalizedOpsId))
      throw new Error("Enter a valid Ops ID.");
    if (!nextPassword) throw new Error("Enter your password.");
    const session = await api<{ access_token: string; refresh_token: string }>(
      "/auth/backroom/login",
      {
        method: "POST",
        body: JSON.stringify({
          ops_id: normalizedOpsId,
          password: nextPassword,
        }),
      },
    );
    const { error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError) throw sessionError;
  }

  async function submit(event: FormEvent, submittedCode?: string) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setOtpPendingAction("verify");
    setBusy(true);
    try {
      if (type === "fte") {
        const normalized = email.trim().toLowerCase();
        if (!normalized.endsWith("@spxexpress.com"))
          throw new Error("Use your @spxexpress.com work email.");
        if (!codeSent) {
          await sendCode(normalized);
        } else {
          const submittedToken = (submittedCode ?? code).trim();
          if (!/^\d{6}$/.test(submittedToken)) {
            throw new Error(
              "Enter the 6-digit verification code from your email.",
            );
          }
          const { error: verifyError } = await supabase.auth.verifyOtp({
            email: normalized,
            token: submittedToken,
            type: "email",
          });
          if (verifyError) throw verifyError;
        }
      } else {
        await startBackroomSession(opsId, password);
      }
    } catch (cause) {
      const fallback =
        type === "fte"
          ? codeSent
            ? "Unable to verify the code. Request a new code and check the Supabase Auth logs."
            : "Unable to send a verification email. Check the Supabase Auth logs and custom SMTP configuration."
          : "Unable to sign in.";
      setError(describeAuthError(cause, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoginCard modal={modal} visible={visible}>
      <div className="mb-5">
        <span className="mb-2 block text-[.68rem] font-semibold uppercase tracking-[.16em] text-auth-faint">
          Login as
        </span>
        <UserTypeToggle value={type} onChange={switchType} />
      </div>

      {type === "fte" ? (
        <FteLoginForm
          key="fte"
          email={email}
          code={code}
          codeSent={codeSent}
          resendAfter={resendAfter}
          busy={busy}
          error={error}
          onEmailChange={setEmail}
          onCodeChange={setCode}
          onSubmit={submit}
          onResendCode={resendCode}
          onGoogleSignIn={signInWithGoogle}
          onBackToEmail={backToEmail}
          pendingAction={otpPendingAction}
        />
      ) : (
        <BackroomLoginForm
          key="backroom"
          opsId={opsId}
          password={password}
          busy={busy}
          error={error}
          onOpsIdChange={setOpsId}
          onPasswordChange={setPassword}
          onSubmit={submit}
          onForgotPassword={() => setForgotOpen(true)}
        />
      )}
      {forgotOpen && type === "backroom" && (
        <AccessibleDialog
          open
          label="Forgot password"
          onClose={() => setForgotOpen(false)}
          overlayClassName={loginModalLayerClass}
          className={`${loginModalCardClass} max-w-[360px] p-6 opacity-100 translate-y-0`}
        >
            <div className="mx-auto grid h-12 w-12 animate-pulse place-items-center rounded-full bg-auth-accent/15 text-auth-accent">
              <KeyRound size={23} aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-center font-display text-lg font-semibold text-auth-ink">
              Forgot password?
            </h2>
            <p className="mt-2 text-center text-xs leading-relaxed text-auth-muted">
              To reset your password, please reach out to your FTE for
              assistance.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-xl bg-auth-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
        </AccessibleDialog>
      )}
    </LoginCard>
  );
}
