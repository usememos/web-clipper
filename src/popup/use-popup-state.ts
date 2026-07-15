import { useEffect, useState } from "react";
import { type PopupState, readPopupState, writePopupState } from "@/lib/popup-state";
import { sendBackgroundRequest } from "@/lib/runtime-client";

/**
 * Returns the durable UI snapshot first, then replaces it with the background OAuth session's
 * authoritative state. Both reads begin immediately; network latency never blocks the cached render.
 */
export function usePopupState(): PopupState | null {
  const [state, setState] = useState<PopupState | null>(null);

  useEffect(() => {
    let active = true;
    const livePromise = sendBackgroundRequest({ type: "GET_POPUP_STATE" }).catch(() => undefined);

    void (async () => {
      const cached = await readPopupState();
      if (active && cached) setState(cached);

      const live = await livePromise;
      if (!active || !live) return;
      setState(live);
      await writePopupState(live);
    })();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
