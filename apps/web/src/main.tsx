import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreferencesProvider } from "./app/preferences.js";
import { AuthProvider } from "./app/auth.js";
import { MeterUnitsProvider } from "./app/meterUnits.js";
import { BranchProvider } from "./app/branches.js";
import { ToastProvider } from "./app/toasts.js";
import { I18nProvider } from "./app/i18n.js";
import { TutorialProvider } from "./app/tutorial.js";
import { App } from "./App.js";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/refinement.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <PreferencesProvider>
      <ToastProvider>
        <AuthProvider>
          <I18nProvider>
            <TutorialProvider>
              <BranchProvider>
                <MeterUnitsProvider>
                  <App />
                </MeterUnitsProvider>
              </BranchProvider>
            </TutorialProvider>
          </I18nProvider>
        </AuthProvider>
      </ToastProvider>
    </PreferencesProvider>
  </StrictMode>,
);
