import { useCallback, useEffect, useState } from "react";
import type { SaveErrorKind } from "@/lib/errors";
import { type DestinationConnection, destinationStorageKey } from "@/lib/memo-destination";
import type { SpaceSummary } from "@/lib/memos-client";
import { sendBackgroundRequest } from "@/lib/runtime-client";

export type SpaceListState = {
  key: string | null;
  status: "loading" | "ready" | "error";
  items: SpaceSummary[];
  errorKind?: SaveErrorKind;
};

export function useSpaceList(connection: DestinationConnection | null, supportsSpaces: boolean) {
  const key = connection ? destinationStorageKey(connection) : null;
  const [spaceList, setSpaceList] = useState<SpaceListState>({ key: null, status: "loading", items: [] });
  const [reload, setReload] = useState(0);
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
          if (active) {
            setSpaceList(
              result?.ok
                ? { key, status: "ready", items: result.spaces }
                : { key, status: "error", items: [], errorKind: result?.errorKind ?? "extension-error" },
            );
          }
        })
        .catch(() => {
          if (active) setSpaceList({ key, status: "error", items: [], errorKind: "extension-error" });
        });
    }
    return () => {
      active = false;
    };
  }, [key, source, connectionId, instanceUrl, supportsSpaces, reload]);

  const spaces: SpaceListState =
    !supportsSpaces || !key
      ? { key, status: "ready", items: [] }
      : spaceList.key === key
        ? spaceList
        : { key, status: "loading", items: [] };

  const reloadSpaces = useCallback(() => setReload((value) => value + 1), []);

  return { spaces, reloadSpaces };
}
