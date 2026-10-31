import { describe, expect, it } from "vitest";
import { describeSaveError, formatBytes, InstanceError, QuotaExceededError, RateLimitedError, toSaveFailure } from "@/lib/errors";

describe("InstanceError", () => {
  it("carries the kind", () => {
    const e = new InstanceError("unauthorized");
    expect(e.kind).toBe("unauthorized");
    expect(e.name).toBe("InstanceError");
  });
});

describe("describeSaveError", () => {
  it("explains an unauthorized token with fix steps", () => {
    const d = describeSaveError("unauthorized");
    expect(d.title).toMatch(/token/i);
    expect(d.howToFix.length).toBeGreaterThan(0);
  });

  it("describes client-side preconditions distinctly from HTTP failures", () => {
    expect(describeSaveError("not-configured").title).toMatch(/no memos instance/i);
    expect(describeSaveError("auth-unavailable")).toMatchObject({ primaryAction: "retry" });
  });

  it("falls back to bad-response copy for unknown kinds", () => {
    // @ts-expect-error exercising the default branch
    const d = describeSaveError("nonsense");
    expect(d.kind).toBe("bad-response");
  });
});

describe("usage limits and rate limits", () => {
  it("carries the server's limit details from the thrown error into the save failure", () => {
    expect(toSaveFailure(new QuotaExceededError({ metric: "MEMO_CONTENT_BYTES", limit: 8192, usage: 24615 }))).toEqual({
      ok: false,
      errorKind: "quota-exceeded",
      quota: { metric: "MEMO_CONTENT_BYTES", limit: 8192, usage: 24615 },
    });
    expect(toSaveFailure(new RateLimitedError(17))).toEqual({ ok: false, errorKind: "rate-limited", retryAfterSeconds: 17 });
    expect(toSaveFailure(new RateLimitedError())).toEqual({ ok: false, errorKind: "rate-limited" });
    expect(toSaveFailure(new Error("boom"))).toEqual({ ok: false, errorKind: "bad-response" });
  });

  it("names the memo size and the instance's limit when the server reported both", () => {
    const d = describeSaveError("quota-exceeded", "direct", { quota: { metric: "MEMO_CONTENT_BYTES", limit: 8192, usage: 24615 } });
    expect(d.title).toBe("Clip too large for your instance");
    expect(d.why).toBe("This memo is 24.6 kB, and your instance allows 8.2 kB per memo.");
    expect(d.howToFix[0]).toMatch(/Usage limits/);
    expect(d.primaryAction).toBe("retry");
  });

  it("names the memo count limit, and falls back to generic copy for other or unknown metrics", () => {
    expect(describeSaveError("quota-exceeded", null, { quota: { metric: "MEMO_COUNT", limit: 1000, usage: 1000 } }).why).toBe(
      "Your account has reached its limit of 1000 memos.",
    );
    expect(describeSaveError("quota-exceeded", null, { quota: { metric: "STORAGE_BYTES", limit: 1, usage: 2 } }).title).toBe(
      "Usage limit reached",
    );
    expect(describeSaveError("quota-exceeded", null, { quota: { metric: "MEMO_CONTENT_BYTES" } }).title).toBe("Usage limit reached");
    expect(describeSaveError("quota-exceeded").title).toBe("Usage limit reached");
  });

  it("tells the user how long to wait when the server said", () => {
    expect(describeSaveError("rate-limited", null, { retryAfterSeconds: 17 }).howToFix).toEqual(["Try again in 17 seconds."]);
    expect(describeSaveError("rate-limited")).toMatchObject({ primaryAction: "retry", howToFix: ["Try again in a moment."] });
  });

  it("formats byte counts in the UI locale's units", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(8192)).toBe("8.2 kB");
    expect(formatBytes(33_554_432)).toBe("33.6 MB");
  });
});
