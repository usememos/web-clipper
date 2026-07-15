import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/auth/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "@/index.css";
import { Options } from "./Options";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <Options />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
