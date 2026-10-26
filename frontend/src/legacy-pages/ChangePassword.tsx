import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import {
  changePasswordCardClass,
  changePasswordFormClass,
  changePasswordInputClass,
  changePasswordLabelClass,
  changePasswordPageClass,
  changePasswordSubmitClass,
} from "../lib/uiClasses";
export function ChangePassword({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 12)
      return setError("Password must be at least 12 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await api("/auth/password-changed", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onComplete();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to change password.";

      if (/too many attempts|rate limit|too many requests/i.test(message)) {
        setError(
          "Too many password change attempts. Please wait a few minutes and try again.",
        );
        return;
      }

      setError(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={changePasswordPageClass}>
      <section className={changePasswordCardClass}>
        <p className="mb-[.35rem] text-xs font-semibold text-soc5-lime-deep">
          First login
        </p>
        <h1 className="text-[clamp(1.35rem,4vw,1.8rem)] font-bold tracking-tight text-[#0b1d2d]">
          Secure your account
        </h1>
        <p className="mt-2 text-xs leading-normal text-soc5-muted">
          Set a permanent password before continuing.
        </p>
      </section>
      <form
        className={`${changePasswordCardClass} ${changePasswordFormClass}`}
        onSubmit={submit}
      >
        <h2 className="text-base font-bold text-[#203638]">Change password</h2>
        <label className={changePasswordLabelClass}>
          New password
          <input
            className={changePasswordInputClass}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className={changePasswordLabelClass}>
          Confirm password
          <input
            className={changePasswordInputClass}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && (
          <p
            className="rounded-[.5rem] border border-[rgb(194_54_70_/_20%)] bg-[#fff5f6] px-3 py-2 text-xs leading-snug text-[#a4283c]"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          className={changePasswordSubmitClass}
          type="submit"
          disabled={busy}
        >
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </main>
  );
}
