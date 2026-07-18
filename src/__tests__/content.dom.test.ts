import { beforeEach, describe, expect, it } from "vitest";
import { browserMock } from "@/test/browser-mock";

// Content script registers its message listeners on the shared browser mock at import.
beforeEach(async () => {
  await import("@/content");
  document.title = "Test Article";
  document.body.innerHTML = "<article><h1>Headline</h1><p>Some body copy here.</p></article>";
});

describe("content script — SHOW_SAVE_RESULT", () => {
  it("renders a success toast with an Open link in a shadow root", async () => {
    await browserMock.runtime.onMessage.emitFirst({
      type: "SHOW_SAVE_RESULT",
      ok: true,
      title: "Saved to Memos",
      webUrl: "https://memos.example.com/memos/7",
    });

    const host = document.querySelector("div[style*='2147483647']");
    expect(host).not.toBeNull();
    const shadow = (host as HTMLElement).shadowRoot!;
    expect(shadow.textContent).toContain("Saved to Memos");
    const link = shadow.querySelector("a")!;
    expect(link.href).toBe("https://memos.example.com/memos/7");
    expect(link.textContent).toBe("Open");
  });

  it("renders an error toast without a link and replaces a previous toast", async () => {
    await browserMock.runtime.onMessage.emitFirst({ type: "SHOW_SAVE_RESULT", ok: true, title: "Saved to Memos" });
    await browserMock.runtime.onMessage.emitFirst({ type: "SHOW_SAVE_RESULT", ok: false, title: "Access token rejected" });

    const hosts = document.querySelectorAll("div[style*='2147483647']");
    expect(hosts.length).toBe(1);
    const shadow = (hosts[0] as HTMLElement).shadowRoot!;
    expect(shadow.textContent).toContain("Access token rejected");
    expect(shadow.querySelector("a")).toBeNull();
    expect(shadow.querySelector(".toast")?.className).toContain("err");
  });
});

describe("content script — CLEAR_SELECTION", () => {
  it("removes the active selection and blurs the focused element", async () => {
    document.body.innerHTML = "<p>hello world</p><input id='f' />";
    const input = document.getElementById("f") as HTMLInputElement;
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.rangeCount).toBe(1);

    await browserMock.runtime.onMessage.emitFirst({ type: "CLEAR_SELECTION" });

    expect(window.getSelection()?.rangeCount).toBe(0);
    expect(document.activeElement).not.toBe(input);
  });
});

describe("content script — GET_SELECTION", () => {
  it("parses selected markup inertly and resolves relative image attachments", async () => {
    document.body.innerHTML = '<p>Hello<script>window.bad = true</script><img src="/clip.png" alt="clip"></p>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    window.getSelection()?.addRange(range);

    const result = (await browserMock.runtime.onMessage.emitFirst({ type: "GET_SELECTION" })) as {
      markdown: string;
      images: string[];
    };

    expect(result.markdown).toContain("Hello");
    expect(result.markdown).not.toContain("window.bad");
    expect(result.images).toEqual([new URL("/clip.png", document.baseURI).href]);
  });
});
