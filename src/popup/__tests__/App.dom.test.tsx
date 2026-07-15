import { beforeEach, describe, expect, it } from "vitest";
import { POPUP_STATE_KEY, type PopupState } from "@/lib/popup-state";
import { App } from "@/popup/App";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { act, renderWithUser, screen, waitFor } from "@/test/render";

const capture = {
  title: "Hello World",
  url: "https://example.com/post",
  selectionHtml: "<p>Captured body</p>",
};
const identity = { userId: "user_123", displayName: "Steven Li", imageUrl: "https://img.example.com/a.png" };
const readyState: PopupState = {
  status: "ready",
  identity,
  template: null,
  instanceUrl: "https://memos.example.com",
  version: "0.29.1",
  updatedAt: 1,
};

function wireSaveResult(result: unknown = { ok: true, webUrl: "https://memos.example.com/memos/1" }, popupState: PopupState = readyState) {
  browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
    const type = (msg as { type: string }).type;
    if (type === "GET_POPUP_STATE") return popupState;
    if (type === "SAVE_MEMO") return result;
    return undefined;
  });
  browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "Hello World", url: "https://example.com/post" }]);
  browserMock.scripting.executeScript.mockResolvedValue([{ result: capture }]);
}

describe("App — signed-out", () => {
  beforeEach(() => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    browserMock.scripting.executeScript.mockResolvedValue([{ result: capture }]);
    wireSaveResult(undefined, { status: "signed-out", updatedAt: 1 });
  });

  it("shows the sign-in prompt and delegates the flow to the background", async () => {
    const { user } = renderWithUser(<App />);
    expect(await screen.findByText(/sign in with your usememos\.com account to start clipping/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sign in with usememos\.com/i }));
    await waitFor(() => expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_SIGN_IN" }));
  });
});

describe("App — signed-in, no connection", () => {
  beforeEach(() => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    browserMock.scripting.executeScript.mockResolvedValue([{ result: capture }]);
    wireSaveResult(undefined, { status: "disconnected", identity, template: null, updatedAt: 1 });
  });

  it("prompts to connect and opens the options page", async () => {
    const { user } = renderWithUser(<App />);
    expect(await screen.findByText(/connect your memos instance to start clipping/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await waitFor(() => expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled());
  });
});

describe("App — signed-in, unsupported version", () => {
  beforeEach(() => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    browserMock.scripting.executeScript.mockResolvedValue([{ result: capture }]);
    wireSaveResult(undefined, {
      status: "unsupported",
      identity,
      template: null,
      instanceUrl: "https://memos.example.com",
      version: "0.25.9",
      updatedAt: 1,
    });
  });

  it("gates with an upgrade guide link", async () => {
    renderWithUser(<App />);
    expect(await screen.findByText(/unsupported memos version/i)).toBeInTheDocument();
    const upgrade = screen.getByRole("link", { name: /how to upgrade memos/i });
    expect(upgrade).toHaveAttribute("href", "https://www.usememos.com/docs/operations/upgrade");
  });
});

describe("App — signed-in, connected", () => {
  beforeEach(() => {
    wireSaveResult();
  });

  it("renders the user badge, the prefilled editor, visibility and save controls", async () => {
    renderWithUser(<App />);
    const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i });
    await waitFor(() => expect(editor.value).toContain("> Captured body"));
    // The prefill is the full composition: quoted selection + linked title.
    expect(editor.value).toContain("[Hello World](https://example.com/post)");
    expect(screen.getByText("Steven Li")).toBeInTheDocument();
    // No per-clip tag input: default tags live in the extension-level template.
    expect(screen.queryByLabelText(/tags/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save to memos/i })).toBeEnabled();
  });

  it("renders from the durable snapshot while live auth reconciliation is still pending", async () => {
    seedStorage({ [POPUP_STATE_KEY]: readyState });
    browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      if ((msg as { type: string }).type === "GET_POPUP_STATE") return new Promise(() => {});
      return { ok: true, webUrl: "https://memos.example.com/memos/1" };
    });

    renderWithUser(<App />);
    const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i });
    await waitFor(() => expect(editor.value).toContain("> Captured body"));
  });

  it("keeps edits accessible and disables save when reconciliation signs the user out", async () => {
    seedStorage({ [POPUP_STATE_KEY]: readyState });
    let resolveState: (state: PopupState) => void = () => {};
    const liveState = new Promise<PopupState>((resolve) => {
      resolveState = resolve;
    });
    browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      if ((msg as { type: string }).type === "GET_POPUP_STATE") return liveState;
      return { ok: true, webUrl: "https://memos.example.com/memos/1" };
    });

    const { user } = renderWithUser(<App />);
    const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i });
    await user.clear(editor);
    await user.type(editor, "keep this draft");

    await act(async () => resolveState({ status: "signed-out", updatedAt: 2 }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/you’re signed out/i);
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i }).value).toBe("keep this draft");
    expect(screen.getByRole("button", { name: /save to memos/i })).toBeDisabled();
  });

  it("disables save only when the composed memo is truly empty (no title, url, or content)", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    browserMock.scripting.executeScript.mockResolvedValue([{ result: { title: "", url: "" } }]);
    renderWithUser(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /save to memos/i })).toBeDisabled());
  });

  it("announces how many selection images will be attached", async () => {
    browserMock.scripting.executeScript.mockResolvedValue([
      { result: { ...capture, images: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"] } },
    ]);
    renderWithUser(<App />);
    expect(await screen.findByText(/2 images from your selection will be attached/i)).toBeInTheDocument();
  });

  it("keeps save enabled on a page with only a title and url — the link-note fallback", async () => {
    browserMock.scripting.executeScript.mockResolvedValue([{ result: { title: "T", url: "https://x.com" } }]);
    browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "T", url: "https://x.com" }]);
    renderWithUser(<App />);
    const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i });
    await waitFor(() => expect(editor.value).toBe("[T](https://x.com)"));
    expect(screen.getByRole("status")).toHaveTextContent(/only the page link was captured/i);
    expect(screen.getByRole("button", { name: /save to memos/i })).toBeEnabled();
  });

  it("explains when a restricted page can only produce a link", async () => {
    browserMock.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "Extensions", url: "chrome://extensions" }]);
    renderWithUser(<App />);
    expect(await screen.findByText(/chrome blocks page access here/i)).toBeInTheDocument();
  });

  it("saves and shows a success toast with an Open link", async () => {
    renderWithUser(<App />);
    const saveBtn = await screen.findByRole("button", { name: /save to memos/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", { name: /memo content/i });
    await waitFor(() => expect(editor.value).toContain("> Captured body"));

    saveBtn.click();

    await waitFor(() =>
      expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "SAVE_MEMO", visibility: "PRIVATE" })),
    );
    expect(await screen.findByText("Saved to Memos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("shows a persistent error with the why and a settings action when the save fails", async () => {
    wireSaveResult({ ok: false, errorKind: "unauthorized" });
    const { user } = renderWithUser(<App />);
    const saveBtn = await screen.findByRole("button", { name: /save to memos/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    saveBtn.click();

    // Title + why + fix, as an alert that stays put (not an auto-dismissing toast).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Access token rejected");
    expect(alert).toHaveTextContent(/token is invalid or expired/i);
    expect(alert).toHaveTextContent(/sign in to usememos\.com and reconnect/i);

    // The fix is a button: unauthorized lives in settings.
    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await waitFor(() => expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled());
  });

  it("retries in place from the error state and clears it on success", async () => {
    wireSaveResult({ ok: false, errorKind: "timeout" });
    const { user } = renderWithUser(<App />);
    const saveBtn = await screen.findByRole("button", { name: /save to memos/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    saveBtn.click();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your instance timed out");

    // Retry succeeds → error bar gone, success toast shown, content was reused (no re-capture).
    wireSaveResult();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Saved to Memos")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when the user edits the content", async () => {
    wireSaveResult({ ok: false, errorKind: "unreachable" });
    const { user } = renderWithUser(<App />);
    const saveBtn = await screen.findByRole("button", { name: /save to memos/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    saveBtn.click();
    await screen.findByRole("alert");

    await user.type(screen.getByRole("textbox", { name: /memo content/i }), " edited");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
