import { useCallback, useEffect, useRef, useState } from "react";
import { useSpaceList } from "@/hooks/use-space-list";
import {
  adaptDestinationForVersion,
  applySpaceChange,
  applyVisibilityChange,
  type DestinationConnection,
  destinationStorageKey,
  type MemoDestination,
  readMemoDestination,
} from "@/lib/memo-destination";
import type { Visibility } from "@/lib/memos-client";

export function useMemoDestination(connection: DestinationConnection | null, supportsSpaces: boolean) {
  const key = connection ? destinationStorageKey(connection) : null;
  const [selection, setSelection] = useState<{ key: string | null; value: MemoDestination }>({
    key: null,
    value: { visibility: "PRIVATE" },
  });
  const { spaces, reloadSpaces } = useSpaceList(connection, supportsSpaces);
  // The connection whose choice the user has made by hand; stored values never replace it, and a
  // gate transition (key → null → same key) must not reset it either.
  const touchedKey = useRef<string | null>(null);
  // Never render another connection's choices while its replacement is loading.
  const current = selection.key === key ? selection.value : { visibility: "PRIVATE" as const };
  const destination: MemoDestination = adaptDestinationForVersion(current, supportsSpaces);

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

  const markTouched = useCallback(() => {
    touchedKey.current = key;
  }, [key]);
  const changeVisibility = useCallback(
    (visibility: Visibility) => {
      markTouched();
      setSelection((previous) => {
        const value: MemoDestination = previous.key === key ? previous.value : { visibility: "PRIVATE" };
        const next = applyVisibilityChange(value, visibility);
        return next === value && previous.key === key ? previous : { key, value: next };
      });
    },
    [key, markTouched],
  );
  const changeSpace = useCallback(
    (space?: string) => {
      markTouched();
      setSelection((previous) => {
        const value: MemoDestination = previous.key === key ? previous.value : { visibility: "PRIVATE" };
        return { key, value: applySpaceChange(value, space) };
      });
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
    reloadSpaces,
    markTouched,
  };
}
