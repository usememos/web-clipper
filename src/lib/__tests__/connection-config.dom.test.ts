import { describe, expect, it } from "vitest";
import { browserMock, seedStorage } from "@/test/browser-mock";
import {
  activeSourceFromConfig,
  CONNECTION_CONFIG_KEY,
  parseConnectionConfig,
  readConnectionConfig,
  writeConnectionConfig,
} from "../connection-config";

const direct = {
  schemaVersion: 1 as const,
  activeSource: "direct" as const,
  direct: {
    connectionId: "direct_123",
    instanceUrl: "https://memos.example.com",
    accessToken: "secret-token",
    user: { name: "users/steven", displayName: "Steven" },
    verifiedAt: 1_700_000_000_000,
  },
};

describe("connection config", () => {
  it("round-trips a versioned direct connection", async () => {
    await writeConnectionConfig(direct);
    await expect(readConnectionConfig()).resolves.toEqual({ kind: "valid", config: direct });
    await expect(browserMock.storage.local.get(CONNECTION_CONFIG_KEY)).resolves.toEqual({
      [CONNECTION_CONFIG_KEY]: direct,
    });
  });

  it("normalizes optional user display fields but never the stored URL", () => {
    expect(
      parseConnectionConfig({
        ...direct,
        direct: { ...direct.direct, user: { name: "users/steven", displayName: "  " } },
      }),
    ).toEqual({ ...direct, direct: { ...direct.direct, user: { name: "users/steven" } } });
    expect(parseConnectionConfig({ ...direct, direct: { ...direct.direct, instanceUrl: "https://memos.example.com/" } })).toBeNull();
  });

  it.each([
    null,
    { schemaVersion: 2, activeSource: null },
    { schemaVersion: 1, activeSource: "unknown" },
    { ...direct, direct: { ...direct.direct, accessToken: "" } },
    { ...direct, direct: { ...direct.direct, instanceUrl: "javascript:alert(1)" } },
    { ...direct, direct: { ...direct.direct, verifiedAt: Number.NaN } },
    { ...direct, direct: { ...direct.direct, user: {} } },
  ])("fails closed for malformed config %#", (value) => {
    expect(parseConnectionConfig(value)).toBeNull();
  });

  it("distinguishes missing, invalid, disabled, and explicit sources", async () => {
    await expect(readConnectionConfig()).resolves.toEqual({ kind: "missing" });
    expect(activeSourceFromConfig({ kind: "missing" })).toBe("usememos");

    seedStorage({ [CONNECTION_CONFIG_KEY]: { schemaVersion: 2 } });
    const invalid = await readConnectionConfig();
    expect(invalid).toEqual({ kind: "invalid" });
    expect(activeSourceFromConfig(invalid)).toBeNull();

    seedStorage({ [CONNECTION_CONFIG_KEY]: { schemaVersion: 1, activeSource: null } });
    const disabled = await readConnectionConfig();
    expect(activeSourceFromConfig(disabled)).toBeNull();
  });
});
