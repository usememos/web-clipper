import { describe, expect, it } from "vitest";
import { describeSaveError } from "@/lib/errors";
import { setBrowserLocale } from "@/test/browser-mock";
import spanishMessages from "../../../public/_locales/es/messages.json" with { type: "json" };

describe("localized save errors", () => {
  it("describes a rejected token in Spanish", () => {
    setBrowserLocale("es", spanishMessages);

    const description = describeSaveError("unauthorized", "direct");

    expect(description.title).toBe("Token de acceso rechazado");
    expect(description.howToFix[0]).toBe("Reemplace el token en la configuración de la extensión.");
  });
});
