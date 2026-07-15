import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import browser from "webextension-polyfill";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import type { OAuthUser } from "./oauth-session";

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: OAuthUser | null;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const reload = useCallback(async () => {
    const next = await sendBackgroundRequest({ type: "GET_AUTH_USER" });
    setUser(next);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
    const listener = (message: unknown) => {
      if ((message as { type?: string } | null)?.type === "AUTH_CHANGED") void reload();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [reload]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: user !== null,
      user,
      reload,
      signOut: async () => {
        await sendBackgroundRequest({ type: "SIGN_OUT" });
        setUser(null);
      },
    }),
    [isLoaded, reload, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
