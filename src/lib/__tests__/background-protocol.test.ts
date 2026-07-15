import { describe, expect, it } from "vitest";
import { isTrustedBackgroundRequest, parseBackgroundRequest } from "../background-protocol";

const save = {
  type: "SAVE_MEMO",
  content: "draft",
  visibility: "PRIVATE",
  expectedUserId: "user_123",
  expectedInstanceUrl: "https://memos.example.com",
} as const;

describe("background protocol", () => {
  it("parses valid popup requests", () => {
    expect(parseBackgroundRequest({ type: "GET_POPUP_STATE" })).toEqual({ type: "GET_POPUP_STATE" });
    expect(parseBackgroundRequest(save)).toEqual(save);
  });

  it.each([
    null,
    { type: "SAVE_MEMO", content: 1, visibility: "PRIVATE", expectedUserId: "u", expectedInstanceUrl: "https://x" },
    { ...save, visibility: "SECRET" },
    { ...save, expectedUserId: "" },
    { ...save, images: ["ok", 2] },
    { ...save, saveRequestId: "bad id" },
    { ...save, saveStartedAt: Number.NaN },
    { type: "UNKNOWN" },
  ])("rejects malformed input %#", (input) => {
    expect(parseBackgroundRequest(input)).toBeNull();
  });

  it("allows privileged requests only from their extension page", () => {
    const request = parseBackgroundRequest(save)!;
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/popup/index.html" }, "ext")).toBe(true);
    // Firefox moz-extension URL hosts are internal UUIDs and need not equal runtime.id.
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "moz-extension://internal-uuid/src/popup/index.html" }, "ext")).toBe(true);
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "https://example.com/post" }, "ext")).toBe(false);
    expect(isTrustedBackgroundRequest(request, { id: "other", url: "chrome-extension://other/src/popup/index.html" }, "ext")).toBe(false);
  });

  it("allows sign-in from popup and options but not a content script", () => {
    const request = parseBackgroundRequest({ type: "OPEN_SIGN_IN" })!;
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/options/index.html" }, "ext")).toBe(true);
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "https://example.com" }, "ext")).toBe(false);
  });
});
