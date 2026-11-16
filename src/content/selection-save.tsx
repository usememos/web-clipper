import { Button, Tooltip } from "@usememos/ui";
import styles from "@usememos/ui/styles.css?inline";
import tokens from "@usememos/ui/tokens.css?inline";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import markUrl from "../../assets/brand/mark-small.svg";

const EDITABLE_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';

function selectionEnd(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return null;
  if (document.activeElement?.closest(EDITABLE_SELECTOR)) return null;
  const range = selection.getRangeAt(selection.rangeCount - 1);
  for (const node of [range.startContainer, range.endContainer]) {
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (element?.closest(EDITABLE_SELECTOR)) return null;
  }
  const endpoint = range.cloneRange();
  endpoint.collapse(false);
  const rect = Array.from(endpoint.getClientRects()).find((item) => item.height > 0) ?? Array.from(range.getClientRects()).at(-1);
  if (!rect || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
    return null;
  }
  return rect;
}

/** https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects */
export function createSelectionSaveButton(onSave: () => Promise<void>) {
  const host = document.createElement("div");
  host.dataset.memosSelectionSave = "";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${tokens}\n${styles}`;
  const mount = document.createElement("div");
  mount.className = "mu-root";
  shadow.append(style, mount);
  const root = createRoot(mount);
  let saving = false;
  let destroyed = false;

  const render = () => {
    const label = browser.i18n.getMessage("contextMenuSaveSelection");
    mount.dataset.theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.render(
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Button
                size="sm"
                aria-label={label}
                loading={saving}
                loadingLabel={label}
                icon={
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      width: "var(--mu-row-icon)",
                      height: "var(--mu-row-icon)",
                      background: "currentColor",
                      mask: `url("${markUrl}") center / contain no-repeat`,
                    }}
                  />
                }
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!event.isTrusted || saving) return;
                  saving = true;
                  render();
                  const finish = () => {
                    saving = false;
                    if (!destroyed) render();
                  };
                  void onSave().then(finish, finish);
                }}
              />
            }
          />
          <Tooltip.Popup container={mount}>{label}</Tooltip.Popup>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
  };

  const update = () => {
    if (destroyed) return;
    const rect = selectionEnd();
    if (!rect) {
      host.remove();
      return;
    }
    if (!host.isConnected) document.documentElement.append(host);
    const css = getComputedStyle(mount);
    const size = Number.parseFloat(css.getPropertyValue("--mu-control-sm")) || host.getBoundingClientRect().width;
    const gap = Number.parseFloat(css.getPropertyValue("--mu-space-2")) || 8;
    const range = window.getSelection()!.getRangeAt(0);
    const parent = range.endContainer.nodeType === Node.ELEMENT_NODE ? (range.endContainer as Element) : range.endContainer.parentElement;
    const rtl = parent && getComputedStyle(parent).direction === "rtl";
    const left = rtl ? rect.left - size - gap : rect.right + gap;
    const top = left < gap || left + size + gap > window.innerWidth ? rect.bottom + gap : rect.top;
    host.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - size - gap))}px`;
    host.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - size - gap))}px`;
    render();
  };

  window.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);
  return {
    update,
    destroy() {
      destroyed = true;
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      root.unmount();
      host.remove();
    },
  };
}
