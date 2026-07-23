import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStateResult } from "@/lib/messages";
import { CLIP_TEMPLATE_KEY } from "@/lib/template-settings";
import { Options } from "@/options/Options";
import { oauthUserWithMemos, setMockOAuthUser } from "@/test/auth-mock";
import { browserMock, setBrowserLocale } from "@/test/browser-mock";
import { renderWithUser, screen, waitFor, within } from "@/test/render";
import simplifiedChineseMessages from "../../../public/_locales/zh_CN/messages.json" with { type: "json" };

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

type Conn = {
  source: "direct" | "usememos" | null;
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
