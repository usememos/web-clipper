import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DestinationConnection, destinationStorageKey, quickSaveDestinationStorageKey } from "@/lib/memo-destination";
import type { ConnectionStateResult } from "@/lib/messages";
import { QUICK_SAVE_SETTINGS_KEY } from "@/lib/quick-save-settings";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { CLIP_TEMPLATE_KEY } from "@/lib/template-settings";
import { Options } from "@/options/Options";
import { oauthUserWithMemos, setMockOAuthUser } from "@/test/auth-mock";
import { browserMock, seedStorage, setBrowserLocale } from "@/test/browser-mock";
import { renderWithUser, screen, waitFor, within } from "@/test/render";
import simplifiedChineseMessages from "../../../public/_locales/zh_CN/messages.json" with { type: "json" };

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

type Conn = {
  source: "direct" | "usememos" | null;
  connectionId: string | null;
  accountId: string | null;
  instanceUrl: string | null;
  version: string | null;
  displayName: string | null;
  status: "disconnected" | "invalid" | "unsupported" | "error" | "ready";
  isChecking: boolean;
  verificationError: ConnectionStateResult["verificationError"];
  isUsingCachedVersion: boolean;
  reverify: ReturnType<typeof vi.fn>;
};

const baseConn = (over: Partial<Conn> = {}): Conn => ({
  source: null,
  connectionId: null,
  accountId: null,
  instanceUrl: null,
  version: null,
  displayName: null,
  status: "disconnected",
  isChecking: false,
  verificationError: null,
  isUsingCachedVersion: false,
  reverify: vi.fn(async () => null),
  ...over,
});

const readyConn = (source: "direct" | "usememos" = "usememos"): Conn =>
  baseConn({
    source,
    connectionId: source === "direct" ? "direct_123" : "user_123",
    ...(source === "direct" ? { accountId: "users/steven" } : {}),
    instanceUrl: "https://memos.example.com",
    version: "0.29.1",
    displayName: source === "direct" ? "Steven" : "Steven Li",
    status: "ready",
  });

let active: Conn;
let cloud: Conn;
vi.mock("@/hooks/use-memos-connection", () => ({
  useMemosConnection: (source: "active" | "usememos" = "active") => (source === "usememos" ? cloud : active),
}));

describe("Options connection methods", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setMockOAuthUser(null);
    active = baseConn();
    cloud = baseConn({ source: "usememos" });
    browserMock.runtime.sendMessage.mockImplementation(async (message: unknown) => {
      const type = (message as { type?: string }).type;
      if (type === "CONNECT_DIRECT" || type === "ACTIVATE_USEMEMOS_CONNECTION") {
        return {
          ok: true,
          state: {
            source: type === "CONNECT_DIRECT" ? "direct" : "usememos",
            instanceUrl: "https://memos.example.com",
            version: "0.29.1",
            displayName: "Steven",
            status: "ready",
            verificationError: null,
            isUsingCachedVersion: false,
          },
        };
      }
      return undefined;
    });
  });

  it("shows the method choice first and recommends usememos.com", () => {
    renderWithUser(<Options />);

    expect(screen.getByText("Choose how to connect")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText(/use it after signing in on other devices/i)).toBeInTheDocument();
    expect(screen.getByText(/personal access token/i)).toBeInTheDocument();
    expect(screen.queryByText(/connection information stays in this browser/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Instance URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("Browser language");
    expect(screen.queryByRole("link", { name: /open memos/i })).not.toBeInTheDocument();
  });

  it("keeps quick saves private until a custom destination or follow-popup mode is selected", async () => {
    const { user, unmount } = renderWithUser(<Options />);
    const customRadio = await screen.findByRole("radio", { name: "Custom destination" });
    await waitFor(() => expect(customRadio).not.toHaveAttribute("aria-disabled", "true"));
    expect(customRadio).toBeChecked();
    expect(screen.getByRole("button", { name: "Quick save destination: Private" })).toBeInTheDocument();
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Quick save destination: Private" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Public/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Public" })).toBeInTheDocument());
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({
      [QUICK_SAVE_SETTINGS_KEY]: { mode: "custom", visibility: "PUBLIC" },
    });

    unmount();
    renderWithUser(<Options />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Public" })).toBeInTheDocument());
  });

  it("configures a Space and Members visibility in quick-save settings on Memos 0.31+", async () => {
    active = { ...readyConn("direct"), version: "0.31.0" };
    const connection: DestinationConnection = {
      source: "direct",
      connectionId: "direct_123",
      instanceUrl: "https://memos.example.com",
      accountId: "users/steven",
    };
    const customKey = quickSaveDestinationStorageKey(connection)!;
    browserMock.runtime.sendMessage.mockImplementation(async (message: unknown) => {
      if ((message as { type?: string }).type === "LIST_SPACES") {
        return { ok: true, spaces: [{ name: "spaces/team", title: "Team" }] };
      }
      return undefined;
    });

    const { user, unmount } = renderWithUser(<Options />);
    const trigger = await screen.findByRole("button", { name: "Quick save destination: Private" });
    await waitFor(() => expect(trigger).toBeEnabled());

    await user.click(trigger);
    (await screen.findByRole("menuitem", { name: /Add to space/i })).focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Team" })).toHaveFocus());
    await user.keyboard("{Enter}");

    const teamTrigger = await screen.findByRole("button", { name: "Quick save destination: Team · Private" });
    await user.click(teamTrigger);
    await user.click(await screen.findByRole("menuitemradio", { name: /Members/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Team · Members" })).toBeInTheDocument());
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({
      [customKey]: { visibility: "SPACE", space: "spaces/team" },
    });

    unmount();
    renderWithUser(<Options />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Team · Members" })).toBeInTheDocument());
  });

  it("switches to follow-popup mode, displays the popup destination, and updates live", async () => {
    active = { ...readyConn("usememos"), version: "0.31.0" };
    const connection: DestinationConnection = {
      source: "usememos",
      connectionId: "user_123",
      instanceUrl: "https://memos.example.com",
    };
    const popupKey = destinationStorageKey(connection)!;
    seedStorage({ [popupKey]: { visibility: "SPACE", space: "spaces/team" } });
    browserMock.runtime.sendMessage.mockImplementation(async (message: unknown) => {
      if ((message as { type?: string }).type === "LIST_SPACES") {
        return {
          ok: true,
          spaces: [
            { name: "spaces/team", title: "Team" },
            { name: "spaces/news", title: "News" },
          ],
        };
      }
      return undefined;
    });

    const { user } = renderWithUser(<Options />);
    const followRadio = await screen.findByRole("radio", { name: "Match last popup save" });
    await waitFor(() => expect(followRadio).not.toHaveAttribute("aria-disabled", "true"));
    await user.click(followRadio);

    expect(await screen.findByText("Current popup destination: Team · Members")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quick save destination:/i })).not.toBeInTheDocument();

    seedStorage({ [popupKey]: { visibility: "PUBLIC", space: "spaces/news" } });
    await browserMock.storage.onChanged.emit({ [popupKey]: { newValue: { visibility: "PUBLIC", space: "spaces/news" } } }, "local");
    expect(await screen.findByText("Current popup destination: News · Public")).toBeInTheDocument();
  });

  it("warns when the configured quick-save Space is unavailable", async () => {
    active = { ...readyConn("usememos"), version: "0.31.0" };
    const connection: DestinationConnection = {
      source: "usememos",
      connectionId: "user_123",
      instanceUrl: "https://memos.example.com",
    };
    seedStorage({ [quickSaveDestinationStorageKey(connection)!]: { visibility: "SPACE", space: "spaces/deleted" } });
    browserMock.runtime.sendMessage.mockImplementation(async (message: unknown) => {
      if ((message as { type?: string }).type === "LIST_SPACES") {
        return { ok: true, spaces: [{ name: "spaces/team", title: "Team" }] };
      }
      return undefined;
    });

    renderWithUser(<Options />);

    expect(await screen.findByText("Choose another Space or remove the current Space to save.")).toBeInTheDocument();
  });

  it("retains the saved destination and reports a write failure", async () => {
    seedStorage({ [QUICK_SAVE_SETTINGS_KEY]: { mode: "custom", visibility: "PROTECTED" } });
    const { user } = renderWithUser(<Options />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Protected" })).toBeEnabled());
    browserMock.storage.local.set.mockRejectedValueOnce(new Error("storage unavailable"));

    await user.click(screen.getByRole("button", { name: "Quick save destination: Protected" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Public/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The extension could not save the quick save destination. Try again.");
    expect(screen.getByRole("button", { name: "Quick save destination: Protected" })).toBeInTheDocument();
  });

  it("retains the current destination while the new choice is being saved", async () => {
    const { user } = renderWithUser(<Options />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Custom destination" })).not.toHaveAttribute("aria-disabled", "true"));
    let finishWrite!: () => void;
    browserMock.storage.local.set.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );

    await user.click(screen.getByRole("radio", { name: "Match last popup save" }));

    expect(screen.getByRole("radio", { name: "Custom destination" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Match last popup save" })).toHaveAttribute("aria-disabled", "true");
    finishWrite();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Match last popup save" })).toBeChecked());
  });

  it("reports a destination read failure and disables choices until settings are reloaded", async () => {
    const get = browserMock.storage.local.get.getMockImplementation()!;
    browserMock.storage.local.get.mockImplementation(async (keys) => {
      if (Array.isArray(keys) && keys.includes(QUICK_SAVE_SETTINGS_KEY)) throw new Error("storage unavailable");
      return get(keys);
    });
    renderWithUser(<Options />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The extension could not read the quick save destination. Reload the settings. Try again.",
    );
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Quick save destination: Private" })).toBeDisabled();
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it.each([undefined, "SPACE", "invalid"])("shows Private for an absent or invalid quick-save setting (%s)", async (stored) => {
    seedStorage({ [QUICK_SAVE_SETTINGS_KEY]: stored });
    renderWithUser(<Options />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Quick save destination: Private" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: "Custom destination" })).toBeChecked();
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("persists a language choice and applies it immediately", async () => {
    const { user } = renderWithUser(<Options />);

    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await user.click(await screen.findByRole("option", { name: "Español" }));

    expect(await screen.findByText("Elige cómo conectarte")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveTextContent("Español");
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ localePreferenceV1: "es" });
  });

  it("keeps the current language and reports a persistence failure", async () => {
    browserMock.storage.local.set.mockRejectedValueOnce(new Error("storage unavailable"));
    const { user } = renderWithUser(<Options />);

    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await user.click(await screen.findByRole("option", { name: "Español" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The language preference couldn't be saved");
    expect(screen.getByText("Choose how to connect")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("Browser language");
  });

  it("renders the connection choices in Simplified Chinese", () => {
    setBrowserLocale("zh-CN", simplifiedChineseMessages);
    renderWithUser(<Options />);

    expect(screen.getByText("选择连接方式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "直接连接" })).toBeInTheDocument();
  });

  it("shows URL and PAT fields only after choosing direct connection", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));

    expect(screen.getByLabelText("Instance URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Access token")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /back to connection methods/i })).toBeInTheDocument();
  });

  it("returns from direct setup to the method choice", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    await user.click(screen.getByRole("button", { name: /back to connection methods/i }));

    expect(screen.getByRole("button", { name: /continue with usememos\.com/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
  });

  it("validates and sends direct credentials only to the background", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    await user.type(screen.getByLabelText("Instance URL"), "https://memos.example.com/");
    await user.type(screen.getByLabelText("Access token"), "memos_pat_secret");
    await user.click(screen.getByRole("button", { name: /test and save/i }));

    await waitFor(() =>
      expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
        type: "CONNECT_DIRECT",
        instanceUrl: "https://memos.example.com",
        accessToken: "memos_pat_secret",
      }),
    );
    expect(active.reverify).toHaveBeenCalled();
  });

  it("does not send remote HTTP credentials before explicit confirmation", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    await user.type(screen.getByLabelText("Instance URL"), "http://memos.lan");
    await user.type(screen.getByLabelText("Access token"), "memos_pat_secret");
    await user.click(screen.getByRole("button", { name: /test and save/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/connection is not encrypted/i);
    expect(browserMock.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "CONNECT_DIRECT" }));

    await user.click(screen.getByRole("button", { name: /continue with http/i }));
    await waitFor(() =>
      expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "CONNECT_DIRECT", allowInsecureHttp: true }),
      ),
    );
  });

  it.each(["0.25.9", null])("shows the unsupported direct version when available (%s)", async (version) => {
    browserMock.runtime.sendMessage.mockResolvedValueOnce({ ok: false, errorKind: "unsupported-version", ...(version ? { version } : {}) });
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    await user.type(screen.getByLabelText("Instance URL"), "https://memos.example.com");
    await user.type(screen.getByLabelText("Access token"), "test-token");
    await user.click(screen.getByRole("button", { name: /test and save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unsupported Memos version");
    if (version) expect(alert).toHaveTextContent(`Your instance is running ${version}.`);
    else expect(alert).not.toHaveTextContent("Your instance is running");
    expect(within(alert).getByRole("link", { name: "How to upgrade Memos" })).toBeInTheDocument();

    browserMock.runtime.sendMessage.mockResolvedValueOnce({ ok: false, errorKind: "unauthorized" });
    await user.click(screen.getByRole("button", { name: /test and save/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Access token rejected"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Your instance is running");
  });

  it("shows the unsupported version from the usememos.com connection", () => {
    setMockOAuthUser(oauthUserWithMemos());
    active = baseConn({ source: "usememos" });
    cloud = baseConn({ source: "usememos", status: "unsupported", version: "0.25.9" });
    renderWithUser(<Options />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your instance is running 0.25.9.");
  });

  it("shows source-aware direct token recovery", async () => {
    browserMock.runtime.sendMessage.mockResolvedValueOnce({ ok: false, errorKind: "unauthorized" });
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    await user.type(screen.getByLabelText("Instance URL"), "https://memos.example.com");
    await user.type(screen.getByLabelText("Access token"), "bad-token");
    await user.click(screen.getByRole("button", { name: /test and save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/access token rejected/i);
    expect(alert).toHaveTextContent(/replace the token in extension settings/i);
    expect(alert).not.toHaveTextContent(/sign in to usememos\.com/i);
  });

  it("selects the recommended source before starting OAuth", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /continue with usememos\.com/i }));

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "SELECT_USEMEMOS_SOURCE" });
    expect(screen.getByRole("button", { name: /^sign in with usememos\.com$/i })).toBeInTheDocument();
  });

  it("starts the existing OAuth flow from the selected usememos.com view", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /continue with usememos\.com/i }));
    await user.click(screen.getByRole("button", { name: /^sign in with usememos\.com$/i }));

    await waitFor(() => expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_SIGN_IN" }));
  });

  it("shows an actionable error when usememos.com activation fails", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    active = baseConn({ source: "usememos" });
    cloud = readyConn("usememos");
    browserMock.runtime.sendMessage.mockImplementation(async (message: unknown) =>
      (message as { type?: string }).type === "ACTIVATE_USEMEMOS_CONNECTION" ? { ok: false, errorKind: "unauthorized" } : undefined,
    );
    const { user } = renderWithUser(<Options />);

    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/access token rejected/i);
    expect(alert).toHaveTextContent(/sign in to usememos\.com and reconnect/i);
  });

  it("links a signed-in account to the existing usememos.com connection manager", () => {
    setMockOAuthUser(oauthUserWithMemos());
    active = baseConn({ source: "usememos" });
    cloud = baseConn({ source: "usememos" });
    renderWithUser(<Options />);

    expect(screen.getByRole("link", { name: /connect on usememos\.com/i })).toHaveAttribute(
      "href",
      "https://usememos.com/settings/connections?source=web-clipper",
    );
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
  });

  it.each(["usememos", "direct"] as const)("shows a sanitized ready summary for %s", (source) => {
    if (source === "usememos") setMockOAuthUser(oauthUserWithMemos());
    active = readyConn(source);
    renderWithUser(<Options />);

    expect(screen.getByText("0.29.1")).toBeInTheDocument();
    expect(screen.getByText(source === "direct" ? "Direct" : "usememos.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
    const connectedSection = screen.getByText("Memos connected").parentElement!;
    expect(within(connectedSection).getByRole("link", { name: "memos.example.com" })).toHaveAttribute("href", "https://memos.example.com");
    expect(within(connectedSection).queryByRole("link", { name: /open memos/i })).not.toBeInTheDocument();
    expect(within(connectedSection).queryByText("Connected")).not.toBeInTheDocument();
    expect(within(connectedSection).queryByText("This browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Connection uses HTTP")).not.toBeInTheDocument();
  });

  it("shows a non-blocking HTTP warning while keeping connection errors separate", async () => {
    active = { ...readyConn("direct"), instanceUrl: "http://localhost:5230", verificationError: "unauthorized" };
    const { rerender } = renderWithUser(<Options />);

    const warning = screen.getByRole("status");
    expect(warning).toHaveTextContent("Connection uses HTTP");
    expect(warning).toHaveTextContent("Your access token and clips are sent without TLS encryption.");
    // The HTTP notice is a warning, not part of the error.
    expect(screen.getByRole("alert")).toHaveTextContent("Access token rejected");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Connection uses HTTP");

    active.verificationError = null;
    rerender(<Options />);
    expect(screen.getByText("Memos connected")).toBeInTheDocument();
    expect(await screen.findByLabelText("Template")).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Connection uses HTTP");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the same method choice when changing a ready connection", async () => {
    active = readyConn("direct");
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /change connection/i }));

    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect directly/i })).toBeInTheDocument();
  });

  it("keeps the template locked until either source is ready", () => {
    renderWithUser(<Options />);
    expect(screen.queryByLabelText("Template")).not.toBeInTheDocument();
    expect(screen.getByText(/connect a supported Memos instance first/i)).toBeInTheDocument();
  });

  it("unlocks and saves the local template for a direct connection", async () => {
    active = readyConn("direct");
    const { user } = renderWithUser(<Options />);
    const editor = await screen.findByLabelText("Template");
    await user.clear(editor);
    await user.type(editor, "Saved locally");
    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [CLIP_TEMPLATE_KEY]: "Saved locally" }));
  });

  it("lets the template quote prefix control the preview and persists the raw-content choice", async () => {
    active = readyConn("direct");
    const { user, container, unmount } = renderWithUser(<Options />);
    const editor = await screen.findByLabelText("Template");
    expect(editor).toHaveValue(DEFAULT_TEMPLATE);
    expect(container.querySelectorAll("blockquote")).toHaveLength(1);
    expect(container.querySelector("blockquote")).toHaveTextContent("The quick brown fox jumps over the lazy dog.");
    expect(container.querySelector("blockquote")).not.toHaveTextContent("> The quick");

    await user.clear(editor);
    await user.paste("{{content}}");
    expect(container.querySelector("blockquote")).toBeNull();
    expect(screen.getByText("The quick brown fox jumps over the lazy dog.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save template/i }));
    await waitFor(() => expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [CLIP_TEMPLATE_KEY]: "{{content}}" }));

    unmount();
    const reopened = renderWithUser(<Options />);
    expect(await screen.findByLabelText("Template")).toHaveValue("{{content}}");
    expect(reopened.container.querySelector("blockquote")).toBeNull();
  });

  it("keeps the rejected connection available for repair without claiming it is connected", async () => {
    active = readyConn("direct");
    active.verificationError = "unauthorized";
    const { user } = renderWithUser(<Options />);

    expect(screen.queryByText("Memos connected")).not.toBeInTheDocument();
    expect(screen.getByText("Connect to Memos")).toBeInTheDocument();
    expect(screen.getByText("Access token rejected")).toBeInTheDocument();
    expect(screen.queryByLabelText("Template")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change connection" }));
    await user.click(screen.getByRole("button", { name: "Connect directly" }));
    expect(screen.getByLabelText("Instance URL")).toHaveValue("https://memos.example.com");
    expect(screen.getByLabelText("Access token")).toHaveValue("");
  });

  it("keeps cached diagnostics visible during a live direct timeout", () => {
    active = readyConn("direct");
    active.verificationError = "timeout";
    active.isUsingCachedVersion = true;
    renderWithUser(<Options />);

    expect(screen.getByText(/instance timed out/i)).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("Last verified")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });
});
