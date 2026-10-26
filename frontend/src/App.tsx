import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import carLoadingUrl from "../assets/Car loading.svg";
import { ApiError, api } from "./lib/api";
import { isKnownAppPath } from "./lib/routes";
import {
  clearSeatalkSessionHint,
  rememberSeatalkSession,
} from "./lib/seatalkSession";
import { supabase } from "./lib/supabase";
import { ChangePassword } from "./legacy-pages/ChangePassword";
import { useUiStore } from "./stores/ui";
import type { User } from "./types";

type AppState =
  | "loading"
  | "signed-out"
  | "unauthorized"
  | "change-password"
  | "ready";

type Failure = {
  title: string;
  message: string;
  detail: string;
};

const Login = lazy(() =>
  import("./legacy-pages/Login").then((module) => ({ default: module.Login })),
);

const Dashboard = lazy(() =>
  import("./legacy-pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);

const defaultFailure: Failure = {
  title: "Account access failed",
  message: "Unable to load your account.",
  detail: "Sign-in succeeded, but the application could not load your account.",
};

const previewUser: User = {
  id: "preview-user",
  name: "Operations preview",
  role: "ops_pic",
  is_admin: false,
  email: "preview@soc5express.com",
};

function describeFailure(cause: unknown): Failure {
  if (!(cause instanceof ApiError)) {
    return {
      ...defaultFailure,
      message: cause instanceof Error ? cause.message : defaultFailure.message,
    };
  }

  if (cause.status === 403) {
    return {
      title: "Account not provisioned",
      message: cause.message,
      detail:
        "Your sign-in succeeded, but this account does not have active application access.",
    };
  }

  if (cause.status === 503) {
    return {
      title: "Authentication service unavailable",
      message: cause.message,
      detail:
        "The API server cannot use its Supabase configuration. Retry after the deployment configuration is corrected.",
    };
  }

  return {
    ...defaultFailure,
    message: cause.message,
    detail:
      cause.status === 401
        ? "The API rejected this session. Sign out, then sign in again."
        : defaultFailure.detail,
  };
}

export default function App() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("loading");
  const [startupAnimationComplete, setStartupAnimationComplete] =
    useState(false);
  const [failure, setFailure] = useState<Failure>(defaultFailure);
  const [profile, setProfile] = useState<User | null>(null);
  const lastToken = useRef<string | null>(null);
  const currentPrincipal = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const seatalkSession = useRef(false);

  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 400
      : 2000;
    const timer = window.setTimeout(
      () => setStartupAnimationComplete(true),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const resolveSession = useCallback(
    async (session: { access_token: string; user?: { id: string } } | null, force = false, tokenRefresh = false) => {
      if (session && !force && lastToken.current === session.access_token) return;
      // A verified same-principal token refresh must preserve unsaved page state.
      // Unknown or replacement identities hide the protected subtree immediately.
      const preservePage = tokenRefresh && session?.user?.id === currentPrincipal.current;
      if (!preservePage) {
        setState("loading");
        setProfile(null);
        currentPrincipal.current = null;
        useUiStore.getState().setViewRole(null);
      }
      if (!session) {
        lastToken.current = null;
        requestSequence.current += 1;

        if (seatalkSession.current) {
          const requestId = requestSequence.current;
          try {
            const resolvedProfile = await api<User>("/auth/me");
            if (requestId !== requestSequence.current) return;
            currentPrincipal.current = resolvedProfile.id;
            setProfile(resolvedProfile);
            if (
              window.location.pathname === "/" ||
              window.location.pathname === "/login"
            ) {
              router.replace("/dashboard");
            }
            setState(
              resolvedProfile.must_change_password
                ? "change-password"
                : "ready",
            );
            return;
          } catch (cause) {
            if (requestId !== requestSequence.current) return;
            clearSeatalkSessionHint(sessionStorage);
            seatalkSession.current = false;
            if (cause instanceof ApiError && cause.status === 401) {
              setState("signed-out");
              return;
            }
            setFailure(describeFailure(cause));
            setState("unauthorized");
            return;
          }
        }

        setProfile(null);
        setState("signed-out");
        return;
      }

      lastToken.current = session.access_token;
      const requestId = ++requestSequence.current;

      try {
        const resolvedProfile = await api<User>("/auth/me");
        if (requestId !== requestSequence.current) return;
        currentPrincipal.current = resolvedProfile.id;
        setProfile(resolvedProfile);
        if (
          window.location.pathname === "/" ||
          window.location.pathname === "/login"
        ) {
          router.replace("/dashboard");
        }
        setState(
          resolvedProfile.must_change_password ? "change-password" : "ready",
        );
      } catch (cause) {
        if (requestId !== requestSequence.current) return;
        setFailure(describeFailure(cause));
        setState("unauthorized");
      }
    },
    [router],
  );

  const retrySession = useCallback(async () => {
    setState("loading");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setFailure(describeFailure(error));
      setState("unauthorized");
      return;
    }
    await resolveSession(data.session, true);
  }, [resolveSession]);

  useEffect(() => {
    let cancelled = false;
    seatalkSession.current = rememberSeatalkSession(
      window.location.search,
      sessionStorage,
    );

    // SeaTalk OAuth uses the server session cookie. Resolve that session
    // immediately instead of waiting on a Supabase browser session lookup.
    if (seatalkSession.current) {
      void resolveSession(null, true);
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearSeatalkSessionHint(sessionStorage);
        seatalkSession.current = false;
      }
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED"
      ) {
        void resolveSession(session, false, event === "TOKEN_REFRESHED");
      }
    });

    const initialSequence = requestSequence.current;
    void supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (cancelled || error || initialSequence !== requestSequence.current) return;
      void resolveSession(sessionData.session);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [resolveSession]);

  if (!startupAnimationComplete) return <StartupLoading />;
  if (state === "loading") return <StartupLoading />;
  if (state === "signed-out") return <UnauthenticatedEntry />;
  if (state === "unauthorized") {
    return (
      <main className="grid min-h-dvh place-items-center bg-soc5-page px-4 py-8 text-soc5-ink">
        <section className="w-full max-w-md rounded-2xl border border-soc5-line bg-soc5-panel p-6 shadow-lh-2026-lg sm:p-8" aria-labelledby="access-error-title">
          <div className="mb-6 grid size-12 place-items-center rounded-xl bg-status-danger-surface text-status-danger-ink" aria-hidden="true">
            <span className="text-xl font-bold">!</span>
          </div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-linehaul-teal-ink">SOC5 Outbound</p>
          <h1 id="access-error-title" className="text-2xl font-bold tracking-tight">{failure.title}</h1>
          <p className="mt-3 text-sm font-medium text-status-danger-ink">{failure.message}</p>
          <p className="mt-2 text-sm leading-6 text-soc5-muted">{failure.detail}</p>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <button className="min-h-11 flex-1 rounded-lg bg-linehaul-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-linehaul-teal-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linehaul-teal" type="button" onClick={() => void retrySession()}>
              Try again
            </button>
            <button className="min-h-11 flex-1 rounded-lg border border-soc5-line bg-soc5-panel px-4 py-2 text-sm font-semibold text-soc5-ink transition hover:bg-linehaul-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linehaul-teal" type="button" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }
  if (state === "change-password")
    return <ChangePassword onComplete={() => setState("ready")} />;
  return profile ? (
    <Suspense fallback={<StartupLoading />}>
      <Dashboard user={profile} />
    </Suspense>
  ) : (
    <StartupLoading />
  );
}

function StartupLoading() {
  return (
    <main
      className="grid min-h-dvh place-items-center overflow-hidden bg-[#f8fcff]"
      aria-label="Loading SOC5 Outbound"
    >
      <img
        src={carLoadingUrl}
        alt=""
        className="block h-auto max-h-dvh w-[min(100vw,32rem)] aspect-video object-contain"
      />
      <span className="sr-only">Loading SOC5 Outbound</span>
    </main>
  );
}

function UnauthenticatedEntry() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  useEffect(() => {
    if (!isKnownAppPath(pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  return (
    <Fragment>
      <div className="dashboard-preview">
        <Suspense fallback={null}>
          <Dashboard user={previewUser} preview />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <Login modal visible />
      </Suspense>
    </Fragment>
  );
}
