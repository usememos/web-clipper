import { describe, expect, it } from "vitest";
import { setBrowserLocale } from "@/test/browser-mock";
import { localizeDocument } from "../i18n";

describe("localizeDocument", () => {
  it("sets language, direction, and title before the UI renders", () => {
    setBrowserLocale("ar", { popupDocumentTitle: { message: "قص إلى Memos" } }, "rtl");

    localizeDocument("popupDocumentTitle");

    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.title).toBe("قص إلى Memos");
  });
});
