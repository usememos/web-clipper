import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import type { ConnectionStateResult } from "@/lib/messages";
import { sendBackgroundRequest } from "@/lib/runtime-client";

const DISCONNECTED: ConnectionStateResult = {
  instanceUrl: null,
  version: null,
  status: "disconnected",
  verificationError: null,
  isUsingCachedVersion: false,
};

/**
 * Reads only sanitized connection diagnostics from the background. The renderer never
 * receives unsafeMetadata or the Memos access token.
 */
export function useMemosConnection() {
  const { isSignedIn, user } = useAuth();
  const [connection, setConnection] = useState<ConnectionStateResult>(DISCONNECTED);
  const connectionRef = useRef<ConnectionStateResult>(DISCONNECTED);
  const [isChecking, setIsChecking] = useState(false);
  const generation = useRef(0);

  const runCheck = useCallback(
    async (refresh = true): Promise<ConnectionStateResult | null> => {
      const currentGeneration = ++generation.current;
      if (!isSignedIn) {
        setConnection(DISCONNECTED);
        setIsChecking(false);
        return null;
      }

      setIsChecking(true);
      try {
        const next = await sendBackgroundRequest({ type: "GET_CONNECTION_STATE", refresh });
        if (generation.current === currentGeneration) {
          connectionRef.current = next;
          setConnection(next);
        }
        return next;
      } catch {
        const current = connectionRef.current;
        const unavailable: ConnectionStateResult = {
          instanceUrl: current.instanceUrl,
          version: current.version,
          status: "error",
          verificationError: "auth-unavailable",
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
    [isSignedIn],
  );

  useEffect(() => {
    generation.current += 1;
    if (!isSignedIn) {
      connectionRef.current = DISCONNECTED;
      setConnection(DISCONNECTED);
      setIsChecking(false);
      return;
    }
    connectionRef.current = DISCONNECTED;
    setConnection(DISCONNECTED);
    void runCheck(true);
  }, [isSignedIn, runCheck, user?.id]);

  const reverify = useCallback(() => runCheck(true), [runCheck]);

  return {
    instanceUrl: connection.instanceUrl,
    version: connection.version,
    status: connection.status,
    isChecking,
    verificationError: connection.verificationError,
    isUsingCachedVersion: connection.isUsingCachedVersion,
    reverify,
  };
}
