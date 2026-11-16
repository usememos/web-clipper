import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectionSaveButton } from "@/content/selection-save";

describe("selection save button", () => {
  let control: ReturnType<typeof createSelectionSaveButton>;
  let save: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    document.body.innerHTML = "<p>An excerpt to save.</p><textarea>Draft</textarea>";
    window.getSelection()?.removeAllRanges();
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 24, height: 24 } as DOMRect);
    vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
      { left: 100, right: 180, top: 80, bottom: 100, width: 80, height: 20 },
    ] as unknown as DOMRectList);
    save = vi.fn().mockResolvedValue(undefined);
    control = createSelectionSaveButton(save);
  });

  afterEach(() => {
    act(() => control?.destroy());
    vi.restoreAllMocks();
  });

  const select = () => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    window.getSelection()?.addRange(range);
    act(() => control.update());
  };
  const button = () => document.querySelector("[data-memos-selection-save]")?.shadowRoot?.querySelector("button");

  it("shows a named Memos button next to selected text", async () => {
    expect(button()).toBeFalsy();
    select();
    await waitFor(() => expect(button()?.getAttribute("aria-label")).toBe("Save selection to Memos"));
    const host = document.querySelector<HTMLElement>("[data-memos-selection-save]")!;
    expect(host.style.left).toBe("188px");
    expect(host.style.top).toBe("80px");
  });

  it("preserves the selection on pointer press and rejects page-generated clicks", async () => {
    select();
    await waitFor(() => expect(button()).toBeTruthy());
    expect(fireEvent.pointerDown(button()!)).toBe(false);
    expect(fireEvent.mouseDown(button()!)).toBe(false);
    expect(window.getSelection()?.toString()).toBe("An excerpt to save.");
    await act(async () => {
      fireEvent.click(button()!);
      fireEvent.click(button()!);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("hides the button when the selection clears", async () => {
    select();
    await waitFor(() => expect(button()).toBeTruthy());
    window.getSelection()?.removeAllRanges();
    act(() => control.update());
    expect(document.querySelector("[data-memos-selection-save]")).toBeNull();
  });

  it("does not show a button while the user edits text", () => {
    document.querySelector("p")!.setAttribute("contenteditable", "true");
    select();
    expect(button()).toBeFalsy();
  });

  it("hides a selection outside the viewport", () => {
    vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
      { left: 100, right: 180, top: -100, bottom: -80, width: 80, height: 20 },
    ] as unknown as DOMRectList);
    select();
    expect(button()).toBeFalsy();
  });

  it("places the button after an RTL selection", () => {
    document.querySelector("p")!.style.direction = "rtl";
    select();
    expect(document.querySelector<HTMLElement>("[data-memos-selection-save]")!.style.left).toBe("68px");
  });

  it("keeps the button within the viewport at the right edge", () => {
    vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
      { left: 1000, right: 1020, top: 80, bottom: 100, width: 20, height: 20 },
    ] as unknown as DOMRectList);
    select();
    const host = document.querySelector<HTMLElement>("[data-memos-selection-save]")!;
    expect(host.style.left).toBe("992px");
    expect(host.style.top).toBe("108px");
  });
});
