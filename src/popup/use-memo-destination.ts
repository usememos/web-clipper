import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveErrorKind } from "@/lib/errors";
import { type DestinationConnection, destinationStorageKey, type MemoDestination, readMemoDestination } from "@/lib/memo-destination";
import type { SpaceSummary, Visibility } from "@/lib/memos-client";
import { sendBackgroundRequest } from "@/lib/runtime-client";

type SpaceList = { key: string | null; status: "loading" | "ready" | "error"; items: SpaceSummary[]; errorKind?: SaveErrorKind };

export function useMemoDestination(connection: DestinationConnection | null, supportsSpaces: boolean) {
  const key = connection ? destinationStorageKey(connection) : null;
  const [selection, setSelection] = useState<{ key: string | null; value: MemoDestination }>({
    key: null,
    value: { visibility: "PRIVATE" },
  });
  const [spaceList, setSpaceList] = useState<SpaceList>({ key: null, status: "loading", items: [] });
  const [reload, setReload] = useState(0);
  // The connection whose choice the user has made by hand; stored values never replace it, and a
  // gate transition (key → null → same key) must not reset it either.
  const touchedKey = useRef<string | null>(null);
  // Never render another connection's choices while its replacement is loading.
  const current = selection.key === key ? selection.value : { visibility: "PRIVATE" as const };
  const destination: MemoDestination = supportsSpaces
    ? current
    : { visibility: current.visibility === "SPACE" ? "PRIVATE" : current.visibility };
  const spaces: SpaceList = spaceList.key === key ? spaceList : { key, status: "loading", items: [] };

  useEffect(() => {
    if (!key || touchedKey.current === key) return;
    let active = true;
    void readMemoDestination(key)
      .then((stored) => {
        if (active && touchedKey.current !== key) setSelection({ key, value: stored });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key, supportsSpaces]);

  const source = connection?.source;
  const connectionId = connection?.connectionId;
  const instanceUrl = connection?.instanceUrl;
  useEffect(() => {
    let active = true;
    setSpaceList((previous) => ({ key, status: "loading", items: previous.key === key ? previous.items : [] }));
    if (supportsSpaces && key && source && connectionId && instanceUrl) {
      void sendBackgroundRequest({
        type: "LIST_SPACES",
        expectedSource: source,
        expectedConnectionId: connectionId,
        expectedInstanceUrl: instanceUrl,
      })
        .then((result) => {
          if (active)
            setSpaceList(
              result?.ok
                ? { key, status: "ready", items: result.spaces }
                : { key, status: "error", items: [], errorKind: result?.errorKind ?? "extension-error" },
            );
        })
        .catch(() => {
          if (active) setSpaceList({ key, status: "error", items: [], errorKind: "extension-error" });
        });
    }
    return () => {
      active = false;
    };
  }, [key, source, connectionId, instanceUrl, supportsSpaces, reload]);

  const markTouched = useCallback(() => {
    touchedKey.current = key;
  }, [key]);
  const changeVisibility = useCallback(
    (visibility: Visibility) => {
      markTouched();
      setSelection((previous) => {
        const value: MemoDestination = previous.key === key ? previous.value : { visibility: "PRIVATE" };
        return visibility === "SPACE" && !value.space ? previous : { key, value: { ...value, visibility } };
      });
    },
    [key, markTouched],
  );
  const changeSpace = useCallback(
    (space?: string) => {
      markTouched();
      setSelection((previous) => ({
        key,
        value: {
          visibility: previous.key !== key || (!space && previous.value.visibility === "SPACE") ? "PRIVATE" : previous.value.visibility,
          ...(space ? { space } : {}),
        },
      }));
    },
    [key, markTouched],
  );

  return {
    ...destination,
    destinationKey: key,
    spaces,
    spaceUnavailable: Boolean(
      destination.space && spaces.status === "ready" && !spaces.items.some((space) => space.name === destination.space),
    ),
    changeVisibility,
    changeSpace,
    reloadSpaces: () => setReload((value) => value + 1),
    markTouched,
  };
}
