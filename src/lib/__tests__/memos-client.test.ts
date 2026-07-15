import { describe, expect, it, vi } from "vitest";
import type { InstanceError } from "@/lib/errors";
import {
  createAttachment,
  createMemo,
  getCurrentUser,
  getInstanceProfile,
  isValidInstanceUrl,
  listRecentMemos,
  memoWebUrl,
  normalizeInstanceUrl,
} from "@/lib/memos-client";
import { isSupportedVersion, OPENAPI_SNAPSHOT_VERSIONS } from "@/lib/versions";
import { testCreds as creds, jsonResponse } from "@/test/fixtures";

describe("getInstanceProfile", () => {
  it("returns the version string", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "0.29.1" }));
    const profile = await getInstanceProfile(creds, { fetchImpl });
    expect(profile.version).toBe("0.29.1");
    expect(fetchImpl).toHaveBeenCalledWith("https://memos.example.com/api/v1/instance/profile", expect.objectContaining({ method: "GET" }));
  });

  it("throws unauthorized on 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await expect(getInstanceProfile(creds, { fetchImpl })).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("rejects a successful response without a version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(getInstanceProfile(creds, { fetchImpl })).rejects.toMatchObject({ kind: "bad-response" });
  });
});

describe("getCurrentUser", () => {
  it("validates the token and returns the authenticated resource name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ user: { name: "users/steven" } }));
    await expect(getCurrentUser(creds, { fetchImpl })).resolves.toEqual({ name: "users/steven" });
    expect(fetchImpl).toHaveBeenCalledWith("https://memos.example.com/api/v1/auth/me", expect.objectContaining({ method: "GET" }));
  });

  it("rejects a malformed auth response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(getCurrentUser(creds, { fetchImpl })).rejects.toMatchObject({ kind: "bad-response" });
  });
});

describe("createMemo", () => {
  it("POSTs content + visibility and returns the created memo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/42", uid: "abc" }));
    const memo = await createMemo(creds, { content: "hello", visibility: "PRIVATE" }, { fetchImpl });
    expect(memo.name).toBe("memos/42");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://memos.example.com/api/v1/memos");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body)).toEqual({ content: "hello", visibility: "PRIVATE" });
  });

  it("can associate pre-uploaded attachments in the memo creation request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/42" }));
    await createMemo(creds, { content: "hello", visibility: "PRIVATE", attachments: [{ name: "attachments/9" }] }, { fetchImpl });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({
      content: "hello",
      visibility: "PRIVATE",
      attachments: [{ name: "attachments/9" }],
    });
  });

  it("uses a client memo id for server-enforced retry identity without adding it to content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/save-123" }));
    await createMemo(creds, { content: "hello", visibility: "PRIVATE", memoId: "save-123" }, { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://memos.example.com/api/v1/memos?memoId=save-123");
    expect(JSON.parse(init.body)).toEqual({ content: "hello", visibility: "PRIVATE" });
  });

  it("throws unauthorized on 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({
      kind: "unauthorized",
    } satisfies Partial<InstanceError>);
  });

  it("throws mixed-content when https page calls http instance", async () => {
    const httpCreds = { instanceUrl: "http://memos.example.com", accessToken: "t" };
    await expect(createMemo(httpCreds, { content: "x", visibility: "PRIVATE" }, { pageProtocol: "https:" })).rejects.toMatchObject({
      kind: "mixed-content",
    });
  });

  it("classifies a timeout", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps a non-ok status to bad-response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({ kind: "bad-response" });
  });

  it("rejects a 200 response without a memo identity", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({
      kind: "bad-response",
    });
  });

  it("reports cors when the request fails but the probe reaches the server", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch")) // main request
      .mockResolvedValueOnce(new Response(null)); // reachability probe
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({ kind: "cors" });
  });

  it("reports unreachable when both the request and the probe fail", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch")) // main request
      .mockRejectedValueOnce(new TypeError("Failed to fetch")); // reachability probe
    await expect(createMemo(creds, { content: "x", visibility: "PRIVATE" }, { fetchImpl })).rejects.toMatchObject({ kind: "unreachable" });
  });
});

describe("listRecentMemos", () => {
  it("requests newest memos and validates reconciliation fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        memos: [
          {
            name: "memos/42",
            uid: "abc",
            creator: "users/steven",
            content: "hello",
            visibility: "PRIVATE",
            createTime: "2026-07-13T12:00:00Z",
          },
        ],
      }),
    );
    const memos = await listRecentMemos(creds, 20, "users/steven", { fetchImpl });
    expect(memos).toHaveLength(1);
    expect(fetchImpl.mock.calls[0]![0]).toContain("/api/v1/memos?pageSize=20&orderBy=create_time+desc");
    expect(fetchImpl.mock.calls[0]![0]).not.toContain("filter=");
  });

  it.each(["users/1", "users/steven"])("matches authenticated creator resource name %s locally", async (creator) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        memos: [
          {
            name: "memos/other",
            creator: "users/other",
            content: "hello",
            visibility: "PUBLIC",
            createTime: "2026-07-13T12:00:01Z",
          },
          {
            name: "memos/mine",
            creator,
            content: "hello",
            visibility: "PRIVATE",
            createTime: "2026-07-13T12:00:00Z",
          },
        ],
      }),
    );

    await expect(listRecentMemos(creds, 20, creator, { fetchImpl })).resolves.toEqual([
      expect.objectContaining({ name: "memos/mine", creator }),
    ]);
  });

  it("rejects a malformed list response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ memos: [{}] }));
    await expect(listRecentMemos(creds, 20, undefined, { fetchImpl })).rejects.toMatchObject({ kind: "bad-response" });
  });
});

describe("memoWebUrl", () => {
  it("uses uid when present", () => {
    expect(memoWebUrl("https://m.com/", { name: "memos/42", uid: "abc" })).toBe("https://m.com/memos/abc");
  });
  it("falls back to the id parsed from name", () => {
    expect(memoWebUrl("https://m.com", { name: "memos/42" })).toBe("https://m.com/memos/42");
  });
});

describe("normalizeInstanceUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeInstanceUrl("https://m.com/")).toBe("https://m.com");
    expect(normalizeInstanceUrl("https://m.com")).toBe("https://m.com");
  });
});

describe("isValidInstanceUrl", () => {
  it("accepts complete http(s) instance addresses", () => {
    expect(isValidInstanceUrl("https://memos.example.com")).toBe(true);
    expect(isValidInstanceUrl("http://localhost:5230")).toBe(true);
  });

  it("rejects incomplete or credential-bearing addresses", () => {
    expect(isValidInstanceUrl("memos.example.com")).toBe(false);
    expect(isValidInstanceUrl("ftp://memos.example.com")).toBe(false);
    expect(isValidInstanceUrl("https://user:secret@memos.example.com")).toBe(false);
    expect(isValidInstanceUrl("https://memos.example.com?token=secret")).toBe(false);
  });
});

describe("attachments", () => {
  it("createAttachment POSTs filename/type/content and returns the name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ name: "attachments/9" }));
    const att = await createAttachment(creds, { filename: "x.png", type: "image/png", content: "AAAA" }, { fetchImpl });
    expect(att.name).toBe("attachments/9");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://memos.example.com/api/v1/attachments");
    expect(JSON.parse(init.body)).toEqual({ filename: "x.png", type: "image/png", content: "AAAA" });
  });

  it("rejects a successful attachment response without a name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(createAttachment(creds, { filename: "x.png", type: "image/png", content: "AAAA" }, { fetchImpl })).rejects.toMatchObject({
      kind: "bad-response",
    });
  });
});

describe("published OpenAPI compatibility", () => {
  it.each(OPENAPI_SNAPSHOT_VERSIONS)("uses the shared %s contract for every required capability", async (version) => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const value = String(url);
      if (value.endsWith("/api/v1/instance/profile")) return jsonResponse({ version });
      if (value.endsWith("/api/v1/auth/me")) return jsonResponse({ user: { name: "users/steven" } });
      if (value.endsWith("/api/v1/attachments")) return jsonResponse({ name: "attachments/9" });
      if (value.includes("/api/v1/memos?") && init?.method === "GET") {
        return jsonResponse({
          memos: [
            {
              name: "memos/save-123",
              creator: "users/steven",
              content: "hello",
              visibility: "PRIVATE",
              createTime: "2026-07-13T12:00:00Z",
            },
          ],
        });
      }
      if (value.endsWith("/api/v1/memos?memoId=save-123")) return jsonResponse({ name: "memos/save-123" });
      return jsonResponse({}, 404);
    });

    expect(isSupportedVersion(version)).toBe(true);
    await expect(getInstanceProfile(creds, { fetchImpl })).resolves.toEqual({ version });
    await expect(getCurrentUser(creds, { fetchImpl })).resolves.toEqual({ name: "users/steven" });
    await expect(createAttachment(creds, { filename: "page.png", type: "image/png", content: "AAAA" }, { fetchImpl })).resolves.toEqual({
      name: "attachments/9",
    });
    await expect(
      createMemo(
        creds,
        {
          content: "hello",
          visibility: "PRIVATE",
          memoId: "save-123",
          attachments: [{ name: "attachments/9" }],
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({ name: "memos/save-123", uid: undefined });
    await expect(listRecentMemos(creds, 20, "users/steven", { fetchImpl })).resolves.toHaveLength(1);
  });
});
