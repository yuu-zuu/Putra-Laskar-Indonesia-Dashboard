import { useEffect, useState } from "react";

export type RouteKey =
  | "dashboard"
  | "stock-units"
  | "meter-units"
  | "meter-readings"
  | "reconciliation"
  | "reports"
  | "profiles"
  | "accounts"
  | "settings";

const routeMap: Record<string, RouteKey> = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/stock-units": "stock-units",
  "/meter-units": "meter-units",
  "/meter-readings": "meter-readings",
  "/reconciliation": "reconciliation",
  "/reports": "reports",
  "/profiles": "profiles",
  "/accounts": "accounts",
  "/settings": "settings",
};

export function useHashRoute(): RouteKey {
  const [route, setRoute] = useState(resolveRoute);
  useEffect(() => {
    const onHashChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

function resolveRoute(): RouteKey {
  const hash = window.location.hash.slice(1) || "/dashboard";
  if (hash.startsWith("/profiles/")) return "profiles";
  return routeMap[hash] ?? "dashboard";
}
