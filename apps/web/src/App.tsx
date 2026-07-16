import type { ReactNode } from "react";
import { useAuth } from "./app/auth.js";
import { AppShell } from "./components/AppShell.js";
import { LoadingState } from "./components/Feedback.js";
import { useHashRoute } from "./app/routes.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { MeterReadingsPage } from "./pages/MeterReadingsPage.js";
import { ReconciliationPage } from "./pages/ReconciliationPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StockUnitsPage } from "./pages/StockUnitsPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { MeterUnitsPage } from "./pages/MeterUnitsPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { AccountsPage } from "./pages/AccountsPage.js";

export function App() {
  const auth = useAuth();
  const route = useHashRoute();
  if (auth.loading)
    return (
      <main className="auth-loading">
        <LoadingState label="Memeriksa sesi…" />
      </main>
    );
  if (auth.user === null) return <AuthPage />;
  const effectiveRoute = route === "accounts" && auth.user.role !== "ADMIN" ? "dashboard" : route;
  const pages = {
    dashboard: <DashboardPage />,
    "stock-units": <StockUnitsPage />,
    "meter-units": <MeterUnitsPage />,
    "meter-readings": <MeterReadingsPage />,
    reconciliation: <ReconciliationPage />,
    reports: <ReportsPage />,
    profiles: <ProfilePage />,
    accounts: <AccountsPage />,
    settings: <SettingsPage />,
  } satisfies Record<typeof effectiveRoute, ReactNode>;
  return (
    <AppShell route={effectiveRoute} user={auth.user} onLogout={auth.logout}>
      {pages[effectiveRoute]}
    </AppShell>
  );
}
