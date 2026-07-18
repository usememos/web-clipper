import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import type { OAuthUser } from "./oauth-session";

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: OAuthUser | null;
  error: string | null;
  reload: () => Promise<OAuthUser | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadPromise = useRef<Promise<OAuthUser | null> | null>(null);

  const reload = useCallback(() => {
    if (reloadPromise.current) return reloadPromise.current;
    const task = sendBackgroundRequest({ type: "GET_AUTH_USER" })
      .then((next) => {
        setUser(next);
        setError(null);
        return next;
      })
      .catch((cause) => {
        setError("The extension couldn't refresh your usememos.com account.");
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

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: user !== null,
      user,
      error,
      reload,
      signOut: async () => {
        try {
          await sendBackgroundRequest({ type: "SIGN_OUT" });
          setUser(null);
          setError(null);
        } catch (cause) {
          setError("The extension couldn't sign you out. Please try again.");
          throw cause;
        }
      },
    }),
    [error, isLoaded, reload, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
