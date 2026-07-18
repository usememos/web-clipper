import { describe, expect, it } from "vitest";
import { connectionStatus, readCredentials } from "@/lib/connection";

const creds = { instanceUrl: "https://m.com", accessToken: "t" };

describe("readCredentials", () => {
  it("reads memos credentials from Clerk metadata", () => {
    expect(readCredentials({ memos: { instanceUrl: "https://m.com", accessToken: "t" } })).toEqual({
      instanceUrl: "https://m.com",
      accessToken: "t",
    });
  });

  it("returns null when memos is absent", () => {
    expect(readCredentials({})).toBeNull();
    expect(readCredentials(undefined)).toBeNull();
    expect(readCredentials(null)).toBeNull();
  });

  it("returns null when fields are blank or incomplete", () => {
    expect(readCredentials({ memos: { instanceUrl: "", accessToken: "" } })).toBeNull();
    expect(readCredentials({ memos: { instanceUrl: "https://m.com" } })).toBeNull();
  });

  it("rejects malformed or credential-bearing instance URLs", () => {
    expect(readCredentials({ memos: { instanceUrl: "not a url", accessToken: "t" } })).toBeNull();
    expect(readCredentials({ memos: { instanceUrl: "https://user:pass@m.com", accessToken: "t" } })).toBeNull();
    expect(readCredentials({ memos: { instanceUrl: "https://m.com?redirect=evil", accessToken: "t" } })).toBeNull();
  });

  it("normalizes a valid instance URL before use", () => {
    expect(readCredentials({ memos: { instanceUrl: "https://m.com///", accessToken: "t" } })).toEqual({
      instanceUrl: "https://m.com",
      accessToken: "t",
    });
  });
});

describe("connectionStatus", () => {
  it("is disconnected without credentials", () => {
    expect(connectionStatus(null, "0.29.1")).toBe("disconnected");
    expect(connectionStatus(null, null)).toBe("disconnected");
  });
  it("is unsupported when connected but version is old or unknown", () => {
    expect(connectionStatus(creds, "0.21.0")).toBe("unsupported");
    expect(connectionStatus(creds, null)).toBe("unsupported");
  });
  it("is checking while a connected instance version is being resolved", () => {
    expect(connectionStatus(creds, undefined)).toBe("checking");
  });
  it("is ready when connected with a supported version", () => {
    expect(connectionStatus(creds, "0.29.1")).toBe("ready");
  });
});
