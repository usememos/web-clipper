import { beforeEach, describe, expect, it } from "vitest";
import { AI_SETTINGS_KEY, DEFAULT_AI_PREFERENCES } from "@/lib/ai";
import { browserMock } from "@/test/browser-mock";
import { act, renderWithUser, screen, waitFor } from "@/test/render";
import { AiSettingsEditor } from "../ai-settings";

describe("AI settings editor", () => {
  beforeEach(() => {
    let settings = {
      enabled: false,
      hasApiKey: false,
      preferredTags: [] as string[],
      preferences: { ...DEFAULT_AI_PREFERENCES },
      revision: 0,
    };
    browserMock.runtime.sendMessage.mockImplementation(async (message: any) => {
      if (message.type === "GET_AI_SETTINGS") return { ok: true, settings };
      if (message.type === "SAVE_AI_SETTINGS") {
        settings = {
          enabled: message.enabled,
          hasApiKey: true,
          preferredTags: message.preferredTags,
          preferences: message.preferences,
          revision: settings.revision + 1,
        };
        void browserMock.storage.onChanged.emit({ [AI_SETTINGS_KEY]: {} }, "local");
        return { ok: true, settings };
      }
      if (message.type === "REMOVE_AI_KEY") {
        settings = { ...settings, enabled: false, hasApiKey: false, revision: settings.revision + 1 };
        void browserMock.storage.onChanged.emit({ [AI_SETTINGS_KEY]: {} }, "local");
        return { ok: true, settings };
      }
      return undefined;
    });
  });

  it("saves opt-in, a key, and normalized preferred tags, then clears the key field", async () => {
    const { user } = renderWithUser(<AiSettingsEditor />);
    await user.click(await screen.findByRole("checkbox"));
    await user.type(screen.getByLabelText("DeepSeek API Key"), "sk-test-fixture");
    await user.type(screen.getByLabelText("Preferred tags"), "#编程，TypeScript\nTypeScript");
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));
    await waitFor(() =>
      expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
        type: "SAVE_AI_SETTINGS",
        enabled: true,
        apiKey: "sk-test-fixture",
        preferredTags: ["编程", "TypeScript"],
        preferences: DEFAULT_AI_PREFERENCES,
        expectedRevision: 0,
      }),
    );
    expect(screen.getByLabelText("DeepSeek API Key")).toHaveValue("");
    expect(screen.getByLabelText("DeepSeek API Key")).toHaveAttribute("type", "password");
    expect(screen.getByPlaceholderText("Key saved; leave blank to keep it")).toBeInTheDocument();
  });

  it("requires a key when enabling and rejects invalid preferred tags before saving", async () => {
    const { user } = renderWithUser(<AiSettingsEditor />);
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a DeepSeek API Key");
    await user.type(screen.getByLabelText("Preferred tags"), "two words");
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use up to 50 tags");
    expect(browserMock.runtime.sendMessage.mock.calls.filter(([m]) => (m as any).type === "SAVE_AI_SETTINGS")).toHaveLength(0);
  });

  it("removes a saved key and turns off automatic processing", async () => {
    const { user } = renderWithUser(<AiSettingsEditor />);
    await user.click(await screen.findByRole("checkbox"));
    await user.type(screen.getByLabelText("DeepSeek API Key"), "sk-fixture");
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));
    await user.type(screen.getByLabelText("Preferred tags"), "编程");
    await user.click(await screen.findByRole("button", { name: "Remove key and turn off AI" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.queryByRole("button", { name: "Remove key and turn off AI" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Preferred tags")).toHaveValue("编程");
  });
  it("saves output preferences, survives its own storage event, and marks later changes dirty", async () => {
    const { user } = renderWithUser(<AiSettingsEditor />);
    await screen.findByRole("checkbox");
    await user.selectOptions(screen.getByLabelText("When to run"), "manual");
    await user.click(screen.getByText("Output: content, summary, tags, and model"));
    await user.selectOptions(screen.getByLabelText("Content to save"), "summary");
    await user.selectOptions(screen.getByLabelText("Summary and new tag language"), "en");
    await user.selectOptions(screen.getByLabelText("Summary detail"), "detailed");
    await user.selectOptions(screen.getByLabelText("Maximum AI tags"), "0");
    await user.selectOptions(screen.getByLabelText("DeepSeek model"), "deepseek-v4-pro");
    await user.click(screen.getByRole("button", { name: "Save AI settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save AI settings" })).toBeDisabled());
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SAVE_AI_SETTINGS",
        preferences: {
          ...DEFAULT_AI_PREFERENCES,
          automatic: false,
          contentMode: "summary",
          summaryLanguage: "en",
          summaryLength: "detailed",
          tagCount: 0,
          model: "deepseek-v4-pro",
        },
      }),
    );
    expect(screen.queryByRole("button", { name: "Load saved settings (discard draft)" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Maximum AI tags"), "3");
    expect(screen.getByRole("button", { name: "Save AI settings" })).toBeEnabled();
  });

  it("preserves a dirty draft on external settings changes until an explicit reload", async () => {
    const { user } = renderWithUser(<AiSettingsEditor />);
    await user.type(await screen.findByLabelText("Preferred tags"), "MyDraft");
    const implementation = browserMock.runtime.sendMessage.getMockImplementation()!;
    browserMock.runtime.sendMessage.mockImplementation(async (message: any) =>
      message.type === "GET_AI_SETTINGS"
        ? {
            ok: true,
            settings: {
              enabled: false,
              hasApiKey: false,
              preferredTags: ["SavedElsewhere"],
              preferences: DEFAULT_AI_PREFERENCES,
              revision: 4,
            },
          }
        : implementation(message),
    );
    await act(async () => {
      await browserMock.storage.onChanged.emit({ [AI_SETTINGS_KEY]: {} }, "local");
    });
    expect(screen.getByLabelText("Preferred tags")).toHaveValue("MyDraft");
    expect(screen.getByRole("button", { name: "Save AI settings" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Load saved settings (discard draft)" }));
    expect(screen.getByLabelText("Preferred tags")).toHaveValue("SavedElsewhere");
  });

  it("recovers from an initial settings read failure", async () => {
    browserMock.runtime.sendMessage.mockRejectedValueOnce(new Error("worker waking"));
    const { user } = renderWithUser(<AiSettingsEditor />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("checkbox")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
