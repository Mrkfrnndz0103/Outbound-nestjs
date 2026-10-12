import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { loginShineButtonClass } from "../../lib/uiClasses";

interface OtpVerifyProps {
  destination: string;
  resendAfter: number;
  onBack: () => void;
  onDone: (event: FormEvent<HTMLFormElement>, code: string) => void;
  onResend: () => void;
  backLabel?: string;
  busy?: boolean;
  error?: string;
  pendingAction?: "verify" | "resend";
}

export function OtpVerify({
  destination,
  resendAfter,
  onBack,
  onDone,
  onResend,
  backLabel = "Change email",
  busy = false,
  error = "",
  pendingAction = "verify",
}: OtpVerifyProps) {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const errorId = useId();

  useEffect(() => {
    const id = window.setTimeout(() => refs.current[0]?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const complete = otp.every((d) => d !== "");

  const set = (i: number, value: string) => {
    const d = value.replace(/\D/g, "").slice(-1);
    setOtp((p) => {
      const n = [...p];
      n[i] = d;
      return n;
    });
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const key = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const paste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!t) return;
    e.preventDefault();
    const arr = Array(6).fill("");
    t.split("").forEach((c, i) => (arr[i] = c));
    setOtp(arr);
    refs.current[Math.min(t.length, 5)]?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (complete && !busy) {
      onDone(event, otp.join(""));
    }
  };

  return (
    <form
      noValidate
      aria-busy={busy}
      className="w-full animate-login-rise motion-reduce:animate-none"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit(event);
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-auth-accent/15 ring-1 ring-auth-accent/40">
          <Check className="h-4 w-4 text-auth-link" strokeWidth={2.6} />
        </span>
        <h2 className="font-display text-base font-semibold text-auth-ink leading-snug tracking-tight">
          Verify OTP
        </h2>
      </div>
      <p className="mt-2.5 truncate text-xs text-auth-muted leading-relaxed">
        Code sent to{" "}
        <span className="font-semibold text-auth-ink">{destination}</span>
      </p>

      <div className="mt-4 flex gap-1.5">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => key(i, e)}
            onPaste={i === 0 ? paste : undefined}
            inputMode="numeric"
            pattern="[0-9]"
            required
            disabled={busy}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-10 w-full min-w-0 rounded-lg border border-auth-line bg-white/[0.07] text-center font-display text-base font-semibold text-auth-ink outline-none transition-all duration-200 focus:border-auth-accent focus:bg-white/[0.12] focus:ring-4 focus:ring-auth-accent/20 tracking-tight"
          />
        ))}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2.5 rounded-lg border border-auth-danger/40 bg-auth-deep px-3 py-2 text-xs font-medium text-auth-ink leading-snug"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!complete || busy}
        className={`${loginShineButtonClass} group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-auth-accent to-auth-accent-2 font-display text-sm font-semibold text-white shadow-lg shadow-auth-accent/30 transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0 tracking-tight ${
          complete && !busy
            ? "animate-login-ready motion-reduce:animate-none"
            : ""
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="font-semibold">
              {pendingAction === "resend" ? "Resending code…" : "Verifying…"}
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">Verify &amp; Continue</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </button>

      <div className="mt-3.5 text-center text-xs text-auth-muted leading-snug">
        {resendAfter > 0 ? (
          <>
            <span className="block mb-2">
              Resend in{" "}
              <span className="font-semibold tabular-nums text-auth-ink">
                {Math.floor(resendAfter / 60)}:
                {String(resendAfter % 60).padStart(2, "0")}
              </span>
            </span>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onResend();
            }}
            className="font-semibold text-auth-link underline-offset-4 transition hover:underline disabled:cursor-wait disabled:opacity-50 tracking-tight"
          >
            Resend code
          </button>
        )}
        <>
          {resendAfter <= 0 && <span className="mx-2 text-white/25">|</span>}
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="font-medium text-auth-faint underline-offset-4 transition hover:text-auth-muted hover:underline disabled:cursor-wait disabled:opacity-50"
          >
            {backLabel}
          </button>
        </>
      </div>
    </form>
  );
}
