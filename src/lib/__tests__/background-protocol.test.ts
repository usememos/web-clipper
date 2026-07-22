import { describe, expect, it } from "vitest";
import { isTrustedBackgroundRequest, parseBackgroundRequest } from "../background-protocol";

const save = {
  type: "SAVE_MEMO",
  content: "draft",
  visibility: "PRIVATE",
  expectedSource: "usememos",
  expectedConnectionId: "user_123",
  expectedInstanceUrl: "https://memos.example.com",
} as const;

describe("background protocol", () => {
  it("parses valid popup requests", () => {
    expect(parseBackgroundRequest({ type: "GET_POPUP_STATE" })).toEqual({ type: "GET_POPUP_STATE" });
    expect(parseBackgroundRequest({ type: "GET_CONNECTION_STATE", refresh: true })).toEqual({
      type: "GET_CONNECTION_STATE",
      refresh: true,
    });
    expect(parseBackgroundRequest(save)).toEqual(save);
  });

  it.each([
    null,
    {
      type: "SAVE_MEMO",
      content: 1,
      visibility: "PRIVATE",
      expectedSource: "usememos",
      expectedConnectionId: "u",
      expectedInstanceUrl: "https://x",
    },
    { ...save, visibility: "SECRET" },
    { ...save, expectedSource: "other" },
    { ...save, expectedConnectionId: "" },
    { ...save, images: ["ok", 2] },
    { ...save, images: [`https://cdn.example.com/${"x".repeat(8_193)}`] },
    { ...save, saveRequestId: "bad id" },
    { ...save, saveStartedAt: Number.NaN },
    { type: "GET_CONNECTION_STATE", refresh: "yes" },
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

  it("allows sanitized connection diagnostics only from options", () => {
    const request = parseBackgroundRequest({ type: "GET_CONNECTION_STATE", refresh: true })!;
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/options/index.html" }, "ext")).toBe(true);
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/popup/index.html" }, "ext")).toBe(false);
  });

  it("accepts direct credentials only from options and enforces input limits", () => {
    const input = { type: "CONNECT_DIRECT", instanceUrl: "https://memos.example.com", accessToken: "secret" };
    const request = parseBackgroundRequest(input)!;
    expect(request).toEqual(input);
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/options/index.html" }, "ext")).toBe(true);
    expect(isTrustedBackgroundRequest(request, { id: "ext", url: "chrome-extension://ext/src/popup/index.html" }, "ext")).toBe(false);
    expect(parseBackgroundRequest({ ...input, instanceUrl: "x".repeat(2_049) })).toBeNull();
    expect(parseBackgroundRequest({ ...input, accessToken: "x".repeat(8_193) })).toBeNull();
    expect(parseBackgroundRequest({ ...input, allowInsecureHttp: "yes" })).toBeNull();
  });
});
