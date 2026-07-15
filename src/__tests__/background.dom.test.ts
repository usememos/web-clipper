import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION_CACHE_KEY } from "@/lib/instance-version";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { jsonResponse, testCreds } from "@/test/fixtures";

/** Seed the per-device version cache so the gate reads it without a live fetch. */
const seedVersion = (version: string) => seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: testCreds.instanceUrl, version } });

// Background reads OAuth userinfo; this fixture keeps the existing destination-focused cases terse.
type MockUser = {
  id: string;
  unsafeMetadata: Record<string, unknown>;
  reload?: () => Promise<MockUser>;
  fullName?: string;
  username?: string;
  imageUrl?: string;
  primaryEmailAddress?: { emailAddress: string };
};
let mockUser: MockUser | null = null;
const oauthMocks = vi.hoisted(() => ({
  beginOAuthSignIn: vi.fn(async () => undefined),
  clearOAuthSession: vi.fn(async () => undefined),
  getOAuthUser: vi.fn(),
}));
vi.mock("@/auth/oauth-session", () => ({
  beginOAuthSignIn: oauthMocks.beginOAuthSignIn,
  clearOAuthSession: oauthMocks.clearOAuthSession,
  getOAuthUser: oauthMocks.getOAuthUser,
}));

const memos = (extra: Record<string, unknown> = {}) => ({
  memos: { instanceUrl: testCreds.instanceUrl, accessToken: testCreds.accessToken, ...extra },
});
const ready = () => {
  mockUser = { id: "user_123", unsafeMetadata: memos(), fullName: "Steven Li" };
  seedVersion("0.29.1");
};
const expected = { expectedUserId: "user_123", expectedInstanceUrl: testCreds.instanceUrl };
const popupSender = { id: "test-id", url: "chrome-extension://test-id/src/popup/index.html" };
const emitRuntime = (message: unknown, sender = popupSender) => browserMock.runtime.onMessage.emitFirst(message, sender);

// Import once: the module registers its listeners on the shared browser mock at load.
beforeEach(async () => {
  oauthMocks.beginOAuthSignIn.mockClear();
  oauthMocks.clearOAuthSession.mockClear();
  oauthMocks.getOAuthUser.mockImplementation(async () => {
    const current = mockUser?.reload ? await mockUser.reload() : mockUser;
    if (!current) return null;
    return {
      id: current.id,
      displayName: current.fullName ?? current.username ?? current.primaryEmailAddress?.emailAddress ?? "Account",
      ...(current.imageUrl ? { imageUrl: current.imageUrl } : {}),
      unsafeMetadata: current.unsafeMetadata,
    };
  });
  await import("@/background");
});

describe("background — SAVE_MEMO message", () => {
  beforeEach(ready);

  it("creates a memo and returns its web url when permitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/42", uid: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await emitRuntime({
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      ...expected,
    });

    expect(result).toEqual({ ok: true, webUrl: "https://memos.example.com/memos/abc" });
    expect(fetchMock).toHaveBeenCalledWith("https://memos.example.com/api/v1/memos", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("reloads metadata before choosing the destination instance", async () => {
    const fresh: MockUser = {
      id: "user_123",
      unsafeMetadata: {
        memos: { instanceUrl: "https://new.example.com", accessToken: "new-token" },
      },
    };
    mockUser = {
      id: "user_123",
      unsafeMetadata: memos(),
      reload: vi.fn(async () => fresh),
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/42", uid: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    await emitRuntime({
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      expectedUserId: "user_123",
      expectedInstanceUrl: "https://new.example.com",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://new.example.com/api/v1/memos",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new-token" }) }),
    );
    vi.unstubAllGlobals();
  });

  it("uploads popup-captured images as attachments and associates them in the memo POST", async () => {
    const fetchMock = vi.fn((url: unknown, _init?: unknown) => {
      const u = String(url);
      if (u === "https://cdn.example.com/x.png") {
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
      }
      if (u.endsWith("/api/v1/attachments")) return Promise.resolve(jsonResponse({ name: "attachments/9" }));
      if (u.endsWith("/api/v1/memos")) return Promise.resolve(jsonResponse({ name: "memos/7", uid: "xy" }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await emitRuntime({
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      ...expected,
      images: ["https://cdn.example.com/x.png"],
    });

    expect(result).toEqual({ ok: true, webUrl: "https://memos.example.com/memos/xy" });
    const memoPost = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith("/api/v1/memos") && (init as { method: string }).method === "POST",
    );
    expect(JSON.parse((memoPost![1] as { body: string }).body).attachments).toEqual([{ name: "attachments/9" }]);
    vi.unstubAllGlobals();
  });

  it("still saves the text and reports the count when an image upload fails", async () => {
    const fetchMock = vi.fn((url: unknown, _init?: unknown) => {
      const u = String(url);
      if (u === "https://cdn.example.com/broken.png") return Promise.resolve(new Response(null, { status: 404 }));
      if (u.endsWith("/api/v1/memos")) return Promise.resolve(jsonResponse({ name: "memos/7", uid: "xy" }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await emitRuntime({
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      ...expected,
      images: ["https://cdn.example.com/broken.png"],
    });

    expect(result).toEqual({ ok: true, webUrl: "https://memos.example.com/memos/xy", failedImages: 1 });
    vi.unstubAllGlobals();
  });

  it("returns not-configured when there is no Memos connection", async () => {
    mockUser = { id: "user_123", unsafeMetadata: {} };
    const result = await emitRuntime({ type: "SAVE_MEMO", content: "hi", visibility: "PRIVATE", ...expected });
    expect(result).toEqual({ ok: false, errorKind: "not-configured" });
  });

  it("maps an InstanceError to its kind (401 -> unauthorized)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    const result = await emitRuntime({ type: "SAVE_MEMO", content: "hi", visibility: "PRIVATE", ...expected });
    expect(result).toEqual({ ok: false, errorKind: "unauthorized" });
    vi.unstubAllGlobals();
  });

  it("reconciles an exact recent memo before retrying an ambiguous create", async () => {
    const startedAt = Date.now();
    let postCount = 0;
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      if (init?.method === "GET" && String(url).endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ user: { name: "users/steven" } }));
      }
      if (init?.method === "GET" && String(url).includes("/api/v1/memos?")) {
        return Promise.resolve(
          jsonResponse({
            memos: [
              {
                name: "memos/42",
                uid: "abc",
                creator: "users/steven",
                content: "hello",
                visibility: "PRIVATE",
                createTime: new Date(startedAt).toISOString(),
              },
            ],
          }),
        );
      }
      if (init?.method === "POST" && String(url).includes("/api/v1/memos?memoId=")) {
        postCount += 1;
        return Promise.reject(Object.assign(new Error("response lost"), { name: "TimeoutError" }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = {
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      saveRequestId: "clip_retry_123",
      saveStartedAt: startedAt,
      ...expected,
    };

    await expect(emitRuntime(request)).resolves.toEqual({ ok: false, errorKind: "timeout" });
    await expect(emitRuntime(request)).resolves.toEqual({ ok: true, webUrl: "https://memos.example.com/memos/abc" });
    expect(postCount).toBe(1);
    vi.unstubAllGlobals();
  });

  it("ignores unrelated message types", async () => {
    const result = await emitRuntime({ type: "SOMETHING_ELSE" });
    expect(result).toBeUndefined();
  });

  it("rejects a valid privileged message from a content script", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await emitRuntime(
      { type: "SAVE_MEMO", content: "hello", visibility: "PRIVATE", ...expected },
      { id: "test-id", url: "https://example.com/post" },
    );

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects a stale account before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await emitRuntime({
      type: "SAVE_MEMO",
      content: "hello",
      visibility: "PRIVATE",
      expectedUserId: "different_user",
      expectedInstanceUrl: testCreds.instanceUrl,
    });

    expect(result).toEqual({ ok: false, errorKind: "auth-changed" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("background — popup state", () => {
  beforeEach(ready);

  it("returns and caches only non-secret display state", async () => {
    const result = await emitRuntime({ type: "GET_POPUP_STATE" });

    expect(result).toMatchObject({
      status: "ready",
      identity: { userId: "user_123", displayName: "Steven Li" },
      template: null,
      instanceUrl: testCreds.instanceUrl,
      version: "0.29.1",
    });
    expect(JSON.stringify(result)).not.toContain(testCreds.accessToken);
    expect(browserMock.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ popupStateV1: result }));
  });
});

describe("background — sign-in flow", () => {
  it("runs OAuth PKCE, refreshes state, and returns to options", async () => {
    ready();
    await emitRuntime({ type: "OPEN_SIGN_IN" });
    expect(oauthMocks.beginOAuthSignIn).toHaveBeenCalledOnce();
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "AUTH_CHANGED" });
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled();
    expect(browserMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ popupStateV1: expect.objectContaining({ status: "ready" }) }),
    );
  });
});

describe("background — onInstalled", () => {
  it("registers a single context menu covering selection and image", async () => {
    await browserMock.runtime.onInstalled.emit();
    expect(browserMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "save-selection", contexts: ["selection", "image"] }),
    );
    expect(browserMock.contextMenus.create).not.toHaveBeenCalledWith(expect.objectContaining({ id: "save-image" }));
  });
});

describe("background — context menu quick save", () => {
  const click = () =>
    browserMock.contextMenus.onClicked.emit(
      { menuItemId: "save-selection", selectionText: "clip me", pageUrl: "https://example.com/post" },
      { id: 5, title: "Post" },
    );

  it("ready → saves the selection through the template and flashes a success badge", async () => {
    ready();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/7", uid: "xy" }));
    vi.stubGlobal("fetch", fetchMock);

    await click();

    expect(browserMock.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.content).toContain("clip me");
    expect(body.content).toContain("https://example.com/post");
    // After a successful save, the page selection is cleared and an in-page toast is shown.
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(5, { type: "CLEAR_SELECTION" });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(5, {
      type: "SHOW_SAVE_RESULT",
      ok: true,
      title: "Saved to Memos",
      webUrl: "https://memos.example.com/memos/xy",
    });
    vi.unstubAllGlobals();
  });

  it("failed save → shows an error toast in the page, no selection clear", async () => {
    ready();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    await click();

    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: "SHOW_SAVE_RESULT",
        ok: false,
        // The in-page toast has no buttons, so the first fix step rides along in the text.
        title: "Access token rejected — Sign in to usememos.com and reconnect.",
      }),
    );
    expect(browserMock.tabs.sendMessage).not.toHaveBeenCalledWith(5, { type: "CLEAR_SELECTION" });
    vi.unstubAllGlobals();
  });

  it("ready + text/image selection → saves the text and attaches the image to the memo", async () => {
    ready();
    // Content script returns the rendered selection: text as markdown + the image pulled out.
    browserMock.tabs.sendMessage.mockImplementation(async (_id: number, msg: unknown) => {
      if ((msg as { type: string }).type === "GET_SELECTION") {
        return { markdown: "hello world", images: ["https://cdn.example.com/x.png"] };
      }
      return undefined;
    });
    const fetchMock = vi.fn((url: unknown, _init?: unknown) => {
      const u = String(url);
      if (u === "https://cdn.example.com/x.png") {
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
      }
      if (u.endsWith("/api/v1/attachments")) return Promise.resolve(jsonResponse({ name: "attachments/9" }));
      if (u.endsWith("/api/v1/memos")) return Promise.resolve(jsonResponse({ name: "memos/7", uid: "xy" }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await browserMock.contextMenus.onClicked.emit(
      { menuItemId: "save-selection", selectionText: "hello world", pageUrl: "https://example.com/post" },
      { id: 5, title: "Post" },
    );

    // The memo body is the text (image is not inline), and the image is associated atomically.
    const memoPost = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith("/api/v1/memos") && (init as { method: string }).method === "POST",
    );
    expect(JSON.parse((memoPost![1] as { body: string }).body).content).toContain("hello world");
    expect(JSON.parse((memoPost![1] as { body: string }).body).attachments).toEqual([{ name: "attachments/9" }]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/v1/memos/7/attachments"))).toBe(false);
    expect(browserMock.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    vi.unstubAllGlobals();
  });

  it("signed out → opens the sign-in flow, no save", async () => {
    mockUser = null;
    await click();
    expect(oauthMocks.beginOAuthSignIn).toHaveBeenCalledOnce();
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("connected but no version match → opens the options page, no save", async () => {
    mockUser = { id: "user_123", unsafeMetadata: memos() };
    seedVersion("0.21.0");
    await click();
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled();
    expect(browserMock.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("not connected → opens the options page, no save", async () => {
    mockUser = { id: "user_123", unsafeMetadata: {} };
    await click();
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("ready + image → uploads the image, attaches it to a memo, and flashes a success badge", async () => {
    ready();
    const fetchMock = vi.fn((url: unknown, _init?: unknown) => {
      const u = String(url);
      if (u === "https://cdn.example.com/pic.png") {
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
      }
      if (u.endsWith("/api/v1/attachments")) return Promise.resolve(jsonResponse({ name: "attachments/9" }));
      if (u.endsWith("/api/v1/memos")) return Promise.resolve(jsonResponse({ name: "memos/7", uid: "xy" }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await browserMock.contextMenus.onClicked.emit(
      { menuItemId: "save-selection", srcUrl: "https://cdn.example.com/pic.png", pageUrl: "https://example.com/post" },
      { id: 5, title: "Post" },
    );

    expect(browserMock.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    const attach = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/v1/attachments"));
    const attachBody = JSON.parse((attach![1] as { body: string }).body);
    expect(attachBody.type).toBe("image/png");
    expect(typeof attachBody.content).toBe("string"); // base64
    const memoPost = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith("/api/v1/memos") && (init as { method: string }).method === "POST",
    );
    expect(JSON.parse((memoPost![1] as { body: string }).body).attachments).toEqual([{ name: "attachments/9" }]);
    vi.unstubAllGlobals();
  });

  it("does nothing without a text selection", async () => {
    ready();
    await browserMock.contextMenus.onClicked.emit({ menuItemId: "save-selection" }, { id: 5, title: "T" });
    expect(browserMock.action.setBadgeText).not.toHaveBeenCalled();
    expect(browserMock.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it("ignores clicks on other menu items", async () => {
    await browserMock.contextMenus.onClicked.emit({ menuItemId: "something-else", selectionText: "x" }, { id: 5 });
    expect(browserMock.action.setBadgeText).not.toHaveBeenCalled();
  });
});
