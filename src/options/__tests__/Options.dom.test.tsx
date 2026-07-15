import { beforeEach, describe, expect, it, vi } from "vitest";
import { Options } from "@/options/Options";
import { oauthUserWithMemos, setMockOAuthUser, signOut } from "@/test/auth-mock";
import { browserMock } from "@/test/browser-mock";
import { renderWithUser, screen, waitFor } from "@/test/render";

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

type Conn = {
  credentials: { instanceUrl: string; accessToken: string } | null;
  version: string | null | undefined;
  status: "disconnected" | "checking" | "unsupported" | "ready";
  template: string | null;
  reverify: () => Promise<void>;
};
let conn: Conn;
vi.mock("@/hooks/use-memos-connection", () => ({ useMemosConnection: () => conn }));

const baseConn = (over: Partial<Conn> = {}): Conn => ({
  credentials: null,
  version: null,
  status: "disconnected",
  template: null,
  reverify: vi.fn(async () => undefined),
  ...over,
});

describe("Options OAuth settings", () => {
  beforeEach(() => {
    setMockOAuthUser(null);
    conn = baseConn();
  });

  it("starts the browser OAuth flow while signed out", async () => {
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /sign in with usememos\.com/i }));
    await waitFor(() => expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_SIGN_IN" }));
  });

  it("sends connection changes to the web app instead of exposing a metadata writer", () => {
    setMockOAuthUser(oauthUserWithMemos());
    renderWithUser(<Options />);
    const link = screen.getByRole("link", { name: /connect on usememos\.com/i });
    expect(link).toHaveAttribute("href", "https://usememos.com/dashboard");
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
  });

  it("shows a read-only connected summary", () => {
    setMockOAuthUser(oauthUserWithMemos());
    conn = baseConn({
      credentials: { instanceUrl: "https://memos.example.com", accessToken: "tok" },
      version: "0.29.1",
      status: "ready",
    });
    renderWithUser(<Options />);
    expect(screen.getByText(/memos\.example\.com · 0\.29\.1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage connection/i })).toHaveAttribute("href", "https://usememos.com/dashboard");
  });

  it("clears the local OAuth session on sign out", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    const { user } = renderWithUser(<Options />);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
