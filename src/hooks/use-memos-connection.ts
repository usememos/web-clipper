import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import type { ConnectionStateResult } from "@/lib/messages";
import { sendBackgroundRequest } from "@/lib/runtime-client";

const DISCONNECTED: ConnectionStateResult = {
  source: null,
  instanceUrl: null,
  version: null,
  displayName: null,
  status: "disconnected",
  verificationError: null,
  isUsingCachedVersion: false,
};

/** Reads sanitized connection diagnostics; saved credentials never leave the worker. */
export function useMemosConnection(source: "active" | "usememos" = "active") {
  const { isSignedIn, user } = useAuth();
  const [connection, setConnection] = useState<ConnectionStateResult>(DISCONNECTED);
  const connectionRef = useRef<ConnectionStateResult>(DISCONNECTED);
  const [isChecking, setIsChecking] = useState(true);
  const generation = useRef(0);

  const runCheck = useCallback(
    async (refresh = true): Promise<ConnectionStateResult> => {
      const currentGeneration = ++generation.current;
      setIsChecking(true);
      try {
        const next = await sendBackgroundRequest({ type: "GET_CONNECTION_STATE", refresh, source });
        if (generation.current === currentGeneration) {
          connectionRef.current = next;
          setConnection(next);
        }
        return next;
      } catch {
        const current = connectionRef.current;
        const unavailable: ConnectionStateResult = {
          source: current.source,
          instanceUrl: current.instanceUrl,
          version: current.version,
          displayName: current.displayName,
          status: "error",
          verificationError: source === "usememos" || isSignedIn ? "auth-unavailable" : "extension-error",
          isUsingCachedVersion: Boolean(current.version),
        };
        if (generation.current === currentGeneration) {
          connectionRef.current = unavailable;
          setConnection(unavailable);
        }
        return unavailable;
      } finally {
        if (generation.current === currentGeneration) setIsChecking(false);
      }
    },
    [source, isSignedIn],
  );

  useEffect(() => {
    generation.current += 1;
    connectionRef.current = DISCONNECTED;
    setConnection(DISCONNECTED);
    void runCheck(true);
  }, [runCheck, user?.id]);

  return {
    source: connection.source,
    instanceUrl: connection.instanceUrl,
    version: connection.version,
    displayName: connection.displayName,
    status: connection.status,
    isChecking,
    verificationError: connection.verificationError,
    isUsingCachedVersion: connection.isUsingCachedVersion,
    reverify: useCallback(() => runCheck(true), [runCheck]),
  };
}
