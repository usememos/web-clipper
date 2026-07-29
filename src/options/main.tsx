import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/auth/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ClipHistory } from "@/history/ClipHistory";
import { initializeLocalePreference, localizeDocument } from "@/lib/i18n";
import "@/index.css";
import { Options } from "./Options";

async function renderOptions(): Promise<void> {
  await initializeLocalePreference();
  const showingHistory = new URLSearchParams(window.location.search).get("view") === "history";
  localizeDocument(showingHistory ? "historyDocumentTitle" : "optionsDocumentTitle");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        {showingHistory ? (
          <ClipHistory />
        ) : (
          <AuthProvider>
            <Options />
          </AuthProvider>
        )}
      </ThemeProvider>
    </StrictMode>,
  );
}

void renderOptions();
