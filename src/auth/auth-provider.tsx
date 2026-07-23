import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { t } from "@/lib/i18n";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import type { OAuthIdentity } from "./oauth-session";

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: OAuthIdentity | null;
  error: string | null;
  reload: () => Promise<OAuthIdentity | null>;
  signOut: () => Promise<void>;
};

type AuthErrorKey = "authRefreshError" | "authSignOutError";
type AuthContextState = Omit<AuthContextValue, "error"> & { errorKey: AuthErrorKey | null };

const AuthContext = createContext<AuthContextState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OAuthIdentity | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const reloadPromise = useRef<Promise<OAuthIdentity | null> | null>(null);

  const reload = useCallback(() => {
    if (reloadPromise.current) return reloadPromise.current;
    const task = sendBackgroundRequest({ type: "GET_AUTH_USER" })
      .then((next) => {
        setUser(next);
        setErrorKey(null);
        return next;
      })
      .catch((cause) => {
        setUser(null);
        setErrorKey("authRefreshError");
        throw cause;
      })
      .finally(() => {
        // A failed first request must not leave the whole options page behind an endless spinner.
        setIsLoaded(true);
        reloadPromise.current = null;
      });
    reloadPromise.current = task;
    return task;
  }, []);

  useEffect(() => {
    void reload().catch(() => {});
    const listener = (message: unknown) => {
      if ((message as { type?: string } | null)?.type === "AUTH_CHANGED") void reload().catch(() => {});
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [reload]);

  const value = useMemo<AuthContextState>(
    () => ({
      isLoaded,
      isSignedIn: user !== null,
      user,
      errorKey,
      reload,
      signOut: async () => {
        try {
          await sendBackgroundRequest({ type: "SIGN_OUT" });
          setUser(null);
          setErrorKey(null);
        } catch (cause) {
          setErrorKey("authSignOutError");
          throw cause;
        }
      },
    }),
    [errorKey, isLoaded, reload, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  const { errorKey, ...context } = value;
  return { ...context, error: errorKey ? t(errorKey) : null };
}
