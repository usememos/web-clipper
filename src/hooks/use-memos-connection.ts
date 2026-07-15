import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { type ConnectionStatus, connectionStatus, readCredentials, readTemplate } from "@/lib/connection";
import { readCachedVersionSync, resolveVersion } from "@/lib/instance-version";

/**
 * Reads the Memos connection supplied by Clerk OAuth userinfo. The extension deliberately
 * exposes no writer: usememos.com remains the single owner of unsafeMetadata.memos.
 */
export function useMemosConnection() {
  const { user } = useAuth();
  const metadata = user?.unsafeMetadata;
  const credentials = useMemo(() => readCredentials(metadata), [metadata]);
  const template = useMemo(() => readTemplate(metadata), [metadata]);
  const cachedVersion = useMemo(() => (credentials ? readCachedVersionSync(credentials.instanceUrl) : null), [credentials]);
  const [resolved, setResolved] = useState<string | null | undefined>(undefined);
  const version = resolved !== undefined ? resolved : (cachedVersion ?? undefined);

  useEffect(() => {
    if (!credentials) {
      setResolved(null);
      return;
    }
    let active = true;
    setResolved(undefined);
    void resolveVersion(credentials).then((next) => {
      if (active) setResolved(next);
    });
    return () => {
      active = false;
    };
  }, [credentials]);

  const status: ConnectionStatus = useMemo(() => connectionStatus(credentials, version), [credentials, version]);

  const reverify = useCallback(async () => {
    if (!credentials) return;
    setResolved(await resolveVersion(credentials, { refresh: true }));
  }, [credentials]);

  return { credentials, version, status, template, reverify };
}
