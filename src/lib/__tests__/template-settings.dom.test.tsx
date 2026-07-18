import { describe, expect, it } from "vitest";
import { CLIP_TEMPLATE_KEY, readClipTemplate, writeClipTemplate } from "@/lib/template-settings";
import { browserMock, seedStorage } from "@/test/browser-mock";

describe("clip template settings", () => {
  it("uses the default when no local override exists", async () => {
    await expect(readClipTemplate()).resolves.toBeNull();
  });

  it("reads and writes a device-local override", async () => {
    seedStorage({ [CLIP_TEMPLATE_KEY]: "{{content}} #saved" });
    await expect(readClipTemplate()).resolves.toBe("{{content}} #saved");

    await writeClipTemplate("{{title}}");
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [CLIP_TEMPLATE_KEY]: "{{title}}" });
  });

  it("removes the override when resetting to the default", async () => {
    await writeClipTemplate(null);
    expect(browserMock.storage.local.remove).toHaveBeenCalledWith(CLIP_TEMPLATE_KEY);
  });

  it("treats a whitespace-only template as the default", async () => {
    await writeClipTemplate("   \n ");
    expect(browserMock.storage.local.remove).toHaveBeenCalledWith(CLIP_TEMPLATE_KEY);
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });
});
