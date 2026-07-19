import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStateResult } from "@/lib/messages";
import { CLIP_TEMPLATE_KEY } from "@/lib/template-settings";
import { Options } from "@/options/Options";
import { oauthUserWithMemos, reloadAuth, setMockOAuthUser, signOut } from "@/test/auth-mock";
import { browserMock } from "@/test/browser-mock";
import { act, renderWithUser, screen, waitFor } from "@/test/render";

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

type Conn = {
  instanceUrl: string | null;
  version: string | null | undefined;
  status: "disconnected" | "invalid" | "checking" | "unsupported" | "error" | "ready";
  isChecking: boolean;
  verificationError: ConnectionStateResult["verificationError"];
  isUsingCachedVersion: boolean;
  reverify: () => Promise<ConnectionStateResult | null>;
};
let conn: Conn;
vi.mock("@/hooks/use-memos-connection", () => ({ useMemosConnection: () => conn }));

const baseConn = (over: Partial<Conn> = {}): Conn => ({
  instanceUrl: null,
  version: null,
  status: "disconnected",
  isChecking: false,
  verificationError: null,
  isUsingCachedVersion: false,
  reverify: vi.fn(async () => null),
  ...over,
});

const connectedState = (): ConnectionStateResult => ({
  instanceUrl: "https://memos.example.com",
  version: "0.29.1",
  status: "ready",
  verificationError: null,
  isUsingCachedVersion: false,
});

describe("Options OAuth settings", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setMockOAuthUser(null);
    conn = baseConn();
  });

  it("starts the browser OAuth flow while signed out", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /sign in with usememos\.com/i }));
    await waitFor(() => expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_SIGN_IN" }));
  });

  it("keeps the page usable and explains an OAuth cancellation", async () => {
    browserMock.runtime.sendMessage.mockRejectedValueOnce(new Error("cancelled"));
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /sign in with usememos\.com/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled or couldn't be completed/i);
    expect(screen.queryByLabelText("Template")).not.toBeInTheDocument();
    expect(screen.getByText(/sign in and connect your Memos instance first/i)).toBeInTheDocument();
  });

  it("sends connection changes to the web app instead of exposing a metadata writer", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    renderWithUser(<Options />);
    const link = screen.getByRole("link", { name: /connect on usememos\.com/i });
    expect(link).toHaveAttribute("href", "https://usememos.com/settings/connections?source=web-clipper");
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
  });

  it("shows a read-only connected summary", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      instanceUrl: "https://memos.example.com",
      version: "0.29.1",
      status: "ready",
    });
    renderWithUser(<Options />);
    await screen.findByLabelText("Template");
    expect(screen.getByText(/memos\.example\.com · 0\.29\.1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage connection/i })).toHaveAttribute(
      "href",
      "https://usememos.com/settings/connections?source=web-clipper",
    );
  });

  it("warns when the connected instance uses unencrypted http", () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      instanceUrl: "http://memos.example.com",
      version: "0.29.1",
      status: "ready",
    });

    renderWithUser(<Options />);

    expect(screen.getByText(/connection is not encrypted/i)).toBeInTheDocument();
    expect(screen.getByText(/access token and clip content over http/i)).toBeInTheDocument();
    expect(screen.getByText(/only for a local development instance such as localhost/i)).toBeInTheDocument();
  });

  it("keeps the template step locked while signed out", () => {
    renderWithUser(<Options />);
    expect(screen.queryByLabelText("Template")).not.toBeInTheDocument();
    expect(screen.getByText(/sign in and connect your Memos instance first/i)).toBeInTheDocument();
  });

  it("keeps the template step locked until a supported instance is connected", () => {
    setMockOAuthUser(oauthUserWithMemos());
    renderWithUser(<Options />);
    expect(screen.queryByLabelText("Template")).not.toBeInTheDocument();
    expect(screen.getByText(/connect a supported Memos instance first/i)).toBeInTheDocument();
  });

  it("marks the web handoff as pending and explains the automatic return check", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("link", { name: /connect on usememos\.com/i }));
    expect(screen.getByRole("link", { name: /waiting for connection/i })).toBeInTheDocument();
    expect(screen.getByText(/will check again when you return/i)).toBeInTheDocument();
  });

  it("refreshes OAuth metadata and clears the pending handoff when the user returns", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn.reverify = vi.fn(async () => connectedState());
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("link", { name: /connect on usememos\.com/i }));

    const connectedUser = oauthUserWithMemos();
    setMockOAuthUser(connectedUser);
    reloadAuth.mockResolvedValueOnce(connectedUser);
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(reloadAuth).toHaveBeenCalled());
    await waitFor(() => expect(conn.reverify).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("link", { name: /connect on usememos\.com/i })).toBeInTheDocument());
    expect(screen.queryByText(/will check again when you return/i)).not.toBeInTheDocument();
  });

  it("resumes a pending handoff when a fresh options page is already focused", async () => {
    sessionStorage.setItem("memosConnectionSetupStartedAt", String(Date.now()));
    setMockOAuthUser(oauthUserWithMemos());
    conn.reverify = vi.fn(async () => connectedState());
    renderWithUser(<Options />);

    await waitFor(() => expect(reloadAuth).toHaveBeenCalled());
    await waitFor(() => expect(conn.reverify).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("link", { name: /connect on usememos\.com/i })).toBeInTheDocument());
    expect(sessionStorage.getItem("memosConnectionSetupStartedAt")).toBeNull();
  });

  it("preserves a last-known supported connection during a live timeout", () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      instanceUrl: "https://memos.example.com",
      version: "0.29.1",
      status: "ready",
      verificationError: "timeout",
      isUsingCachedVersion: true,
    });
    renderWithUser(<Options />);
    expect(screen.getByText("Last verified")).toBeInTheDocument();
    expect(screen.getByText(/instance timed out/i)).toBeInTheDocument();
  });

  it("shows an actionable repair state for incomplete metadata", () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({ status: "invalid" });
    renderWithUser(<Options />);
    expect(screen.getByText(/saved connection is incomplete/i)).toBeInTheDocument();
    expect(screen.getByText(/reconnect it on usememos\.com/i)).toBeInTheDocument();
  });

  it("shows the device-local template editor as step three and saves its override", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      instanceUrl: "https://memos.example.com",
      version: "0.29.1",
      status: "ready",
    });
    const { user } = renderWithUser(<Options />);

    const editor = await screen.findByLabelText("Template");
    expect(screen.getByText(/saved only in this browser/i)).toBeInTheDocument();
    await user.clear(editor);
    await user.type(editor, "Saved locally");
    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [CLIP_TEMPLATE_KEY]: "Saved locally" }));
  });

  it("preserves an unsaved draft when another settings page changes storage", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      instanceUrl: "https://memos.example.com",
      version: "0.29.1",
      status: "ready",
    });
    const { user } = renderWithUser(<Options />);
    const editor = await screen.findByLabelText("Template");
    await user.clear(editor);
    await user.type(editor, "My unsaved draft");

    await act(() =>
      browserMock.storage.onChanged.emit({ [CLIP_TEMPLATE_KEY]: { oldValue: undefined, newValue: "Saved somewhere else" } }, "local"),
    );

    expect(editor).toHaveValue("My unsaved draft");
    expect(screen.getByText(/different settings page saved another template/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /load saved version/i }));
    expect(editor).toHaveValue("Saved somewhere else");
  });

  it("clears the local OAuth session on sign out", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
