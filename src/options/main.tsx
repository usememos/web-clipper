import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/auth/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { initializeLocalePreference, localizeDocument } from "@/lib/i18n";
import "@/index.css";
import { Options } from "./Options";

async function renderOptions(): Promise<void> {
  await initializeLocalePreference();
  localizeDocument("optionsDocumentTitle");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <Options />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

void renderOptions();
