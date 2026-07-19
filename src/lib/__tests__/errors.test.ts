import { describe, expect, it } from "vitest";
import { describeSaveError, InstanceError } from "@/lib/errors";

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
