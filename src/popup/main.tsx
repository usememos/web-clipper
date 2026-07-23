import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import { initializeLocalePreference, localizeDocument } from "@/lib/i18n";
import "@/index.css";
import { App } from "./App";

async function renderPopup(): Promise<void> {
  await initializeLocalePreference();
  localizeDocument("popupDocumentTitle");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
}

void renderPopup();
