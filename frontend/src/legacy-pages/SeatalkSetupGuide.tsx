import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

type SeatalkConfig = {
  appId: string | null;
  configured: boolean;
  approvalConfigured: boolean;
  approvalEnabled: boolean;
};

type ReadinessState =
  | { kind: "loading" }
  | { kind: "ready"; config: SeatalkConfig }
  | { kind: "error"; message: string };

const environmentKeys = [
  "SEATALK_APPROVAL_ENABLED",
  "SEATALK_BASE_URL",
  "SEATALK_APP_ID",
  "SEATALK_APP_SECRET",
  "SEATALK_CALLBACK_SIGNING_SECRET",
  "SEATALK_TOKEN_URL",
  "SEATALK_APPROVAL_CREATE_PATH",
  "SEATALK_APPROVE_CALLBACK_URL",
  "SEATALK_REJECT_CALLBACK_URL",
  "SEATALK_APPROVAL_ASSIGNMENT_SECONDS",
  "SEATALK_PRESENCE_ACTIVE_SECONDS",
  "SEATALK_RUNTIME_INTERVAL_MS",
  "SEATALK_HTTP_TIMEOUT_MS",
];

function StatusMark({ complete }: { complete: boolean }) {
  return complete ? (
    <CheckCircle2 className="size-5 text-status-success-ink" aria-hidden="true" />
  ) : (
    <CircleAlert className="size-5 text-status-warning-ink" aria-hidden="true" />
  );
}

export function SeatalkSetupGuide() {
  const [state, setState] = useState<ReadinessState>({ kind: "loading" });

  const loadConfig = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const config = await api<SeatalkConfig>("/integrations/seatalk/config");
      setState({ kind: "ready", config });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "The backend readiness check could not be completed.",
      });
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const config = state.kind === "ready" ? state.config : null;

  return (
    <div className="min-h-full bg-soc5-page">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-linehaul-teal-ink">
            Administration
          </p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-soc5-ink sm:text-3xl">
                SeaTalk Approval Center setup
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-soc5-muted">
                Prepare the provider app, backend secrets, database, and callback
                checks before enabling dual approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadConfig()}
              disabled={state.kind === "loading"}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-soc5-line bg-soc5-panel px-3 text-sm font-semibold text-soc5-ink transition hover:bg-linehaul-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linehaul-teal disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh status
            </button>
          </div>
        </header>

        <section
          className="mt-8 rounded-xl border border-soc5-line bg-soc5-panel p-5 shadow-lh-2026-sm sm:p-6"
          aria-labelledby="readiness-title"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-linehaul-teal-soft text-linehaul-teal-ink">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="readiness-title" className="font-bold text-soc5-ink">
                Backend readiness
              </h2>
              <p className="mt-1 text-sm leading-6 text-soc5-muted">
                This check reveals configuration state only. Secret values never
                leave the backend.
              </p>
            </div>
          </div>
          {state.kind === "loading" ? (
            <p className="mt-5 text-sm text-soc5-muted" role="status">
              Checking the backend configuration...
            </p>
          ) : state.kind === "error" ? (
            <p className="mt-5 rounded-lg bg-status-danger-surface px-4 py-3 text-sm text-status-danger-ink" role="alert">
              {state.message}
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ReadinessItem label="Workspace app" complete={config?.configured === true} />
              <ReadinessItem label="Approval callbacks" complete={config?.approvalConfigured === true} />
              <ReadinessItem
                label="Feature flag"
                complete={config?.approvalEnabled === true}
                detail={config?.approvalEnabled ? "Enabled" : "Disabled until verification"}
              />
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
          <main className="space-y-6">
            <SetupSection
              icon={<Server className="size-5" aria-hidden="true" />}
              title="Prepare the SeaTalk app"
            >
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-soc5-muted">
                <li>Select the Workspace App used by this system.</li>
                <li>Enable Approval Center and request permission to create approval items and receive action callbacks.</li>
                <li>Include applicants and every FTE OPS approver in the app Data Scope.</li>
                <li>
                  Register public HTTPS callbacks:
                  <code className="mt-2 block break-all rounded-lg bg-soc5-page px-3 py-2 font-mono text-xs text-soc5-ink">
                    /api/v1/integrations/seatalk/approval/approve
                    <br />
                    /api/v1/integrations/seatalk/approval/reject
                  </code>
                </li>
              </ol>
            </SetupSection>

            <SetupSection
              icon={<LockKeyhole className="size-5" aria-hidden="true" />}
              title="Configure backend secrets"
            >
              <p className="text-sm leading-6 text-soc5-muted">
                Add these names to backend-only secret storage. Replace the
                placeholders with the values for the target environment.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {environmentKeys.map((key) => (
                  <code
                    key={key}
                    className="rounded-lg border border-soc5-line bg-soc5-page px-3 py-2 font-mono text-xs text-soc5-ink"
                  >
                    {key}
                  </code>
                ))}
              </div>
              <p className="mt-4 rounded-lg bg-linehaul-lime-surface px-4 py-3 text-sm leading-6 text-status-warning-ink">
                Keep <code className="font-mono text-xs">SEATALK_APPROVAL_ENABLED=false</code>{" "}
                until callbacks, permissions, Data Scope, and signatures pass
                staging verification.
              </p>
            </SetupSection>

            <SetupSection
              icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
              title="Verify the runtime"
            >
              <ul className="space-y-3 text-sm leading-6 text-soc5-muted">
                {[
                  "Apply migrations through 023_seatalk_callback_events.sql.",
                  "Confirm every enabled FTE OPS approver has a unique SeaTalk employee code and a fresh presence heartbeat.",
                  "Deploy with approval disabled and confirm this page reports the expected backend state.",
                  "Create a request and verify one active assignment and one Approval Center item.",
                  "Test approve, reject, duplicate callbacks, late callbacks, inactive approvers, and the three-minute timeout.",
                  "Confirm provider failures remain failed or pending and never approve a request.",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-linehaul-teal-ink" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </SetupSection>
          </main>

          <aside className="space-y-6">
            <section className="rounded-xl border border-soc5-line bg-soc5-panel p-5 shadow-lh-2026-sm" aria-labelledby="runtime-title">
              <h2 id="runtime-title" className="font-bold text-soc5-ink">
                Runtime rules
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <RuntimeRule label="Approval window" value="180 seconds" />
                <RuntimeRule label="Presence threshold" value="60 seconds" />
                <RuntimeRule label="Source of truth" value="PostgreSQL" />
                <RuntimeRule label="Concurrency guard" value="Row locks and unique constraints" />
              </dl>
            </section>
            <section className="rounded-xl border border-soc5-line bg-soc5-panel p-5 shadow-lh-2026-sm" aria-labelledby="operations-title">
              <h2 id="operations-title" className="font-bold text-soc5-ink">
                Operate safely
              </h2>
              <p className="mt-3 text-sm leading-6 text-soc5-muted">
                Monitor failed approval items, failed assignments, stale pending
                requests, callback events stuck in RECEIVED, and scheduler health.
              </p>
              <a
                href="https://open.seatalk.io/docs/overview-of-approval-center"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-linehaul-teal-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linehaul-teal"
              >
                Open SeaTalk documentation
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReadinessItem({
  label,
  complete,
  detail,
}: {
  label: string;
  complete: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-soc5-page px-4 py-3">
      <StatusMark complete={complete} />
      <div>
        <p className="text-sm font-semibold text-soc5-ink">{label}</p>
        <p className="mt-0.5 text-xs text-soc5-muted">
          {detail ?? (complete ? "Configured" : "Needs configuration")}
        </p>
      </div>
    </div>
  );
}

function SetupSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-soc5-line bg-soc5-panel p-5 shadow-lh-2026-sm sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-linehaul-teal-soft text-linehaul-teal-ink">
          {icon}
        </div>
        <h2 className="text-lg font-bold text-soc5-ink">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function RuntimeRule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-soc5-line pb-3 last:border-b-0 last:pb-0">
      <dt className="text-soc5-muted">{label}</dt>
      <dd className="text-right font-semibold text-soc5-ink">{value}</dd>
    </div>
  );
}
