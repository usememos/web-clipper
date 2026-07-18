import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { connectionStatus, readCredentials, readMemosObject } from "@/lib/connection";
import type { InstanceErrorKind } from "@/lib/errors";
import { checkVersion, readCachedVersionSync, type VersionCheckResult } from "@/lib/instance-version";
import type { MemosCredentials } from "@/lib/memos-client";

export type MemosConnectionStatus = "disconnected" | "invalid" | "checking" | "unsupported" | "error" | "ready";

type CheckState = Omit<VersionCheckResult, "version"> & {
  instanceUrl: string | null;
  version: string | null | undefined;
  checking: boolean;
};

/**
 * Reads the Memos connection supplied by Clerk OAuth userinfo. The extension deliberately
 * exposes no connection writer: usememos.com remains the single owner of unsafeMetadata.memos.
 *
 * A generation counter prevents a slow check for an old instance from overwriting a newer
 * account/connection. A supported cached version remains usable during a transient outage,
 * while errorKind lets settings explain that the live verification failed.
 */
export function useMemosConnection() {
  const { user } = useAuth();
  const metadata = user?.unsafeMetadata;
  const memosObject = useMemo(() => readMemosObject(metadata), [metadata]);
  const credentials = useMemo(() => readCredentials(metadata), [metadata]);
  const cachedVersion = useMemo(() => (credentials ? readCachedVersionSync(credentials.instanceUrl) : null), [credentials]);
  const [check, setCheck] = useState<CheckState>({
    instanceUrl: null,
    version: undefined,
    errorKind: null,
    fromCache: false,
    checking: false,
  });
  const generation = useRef(0);

  const runCheck = useCallback(async (target: MemosCredentials | null, refresh = true): Promise<VersionCheckResult | null> => {
    const currentGeneration = ++generation.current;
    if (!target) {
      setCheck({ instanceUrl: null, version: null, errorKind: null, fromCache: false, checking: false });
      return null;
    }

    setCheck((current) => ({
      ...current,
      instanceUrl: target.instanceUrl,
      version:
        current.instanceUrl === target.instanceUrl
          ? (current.version ?? readCachedVersionSync(target.instanceUrl) ?? undefined)
          : (readCachedVersionSync(target.instanceUrl) ?? undefined),
      errorKind: null,
      checking: true,
    }));
    const result = await checkVersion(target, { refresh });
    if (generation.current === currentGeneration) setCheck({ instanceUrl: target.instanceUrl, ...result, checking: false });
    return result;
  }, []);

  useEffect(() => {
    if (!credentials) {
      generation.current += 1;
      setCheck({ instanceUrl: null, version: null, errorKind: null, fromCache: false, checking: false });
      return;
    }
    // Settings is the diagnostic surface, so verify live on entry instead of trusting an old
    // cache indefinitely. The cached value still seeds the first paint and transient fallback.
    void runCheck(credentials, true);
  }, [credentials, runCheck]);

  const version =
    credentials && check.instanceUrl === credentials.instanceUrl && check.version !== undefined
      ? check.version
      : (cachedVersion ?? undefined);
  const baseStatus = connectionStatus(credentials, version);
  let status: MemosConnectionStatus;
  if (!credentials && memosObject) status = "invalid";
  else if (!credentials) status = "disconnected";
  else if (baseStatus === "checking") status = "checking";
  else if (baseStatus === "ready") status = "ready";
  else if (check.errorKind) status = "error";
  else status = "unsupported";

  const reverify = useCallback(
    (nextCredentials: MemosCredentials | null = credentials) => runCheck(nextCredentials, true),
    [credentials, runCheck],
  );

  return {
    credentials,
    version,
    status,
    isChecking: check.checking,
    verificationError: check.errorKind as InstanceErrorKind | null,
    isUsingCachedVersion: check.fromCache,
    reverify,
  };
}
