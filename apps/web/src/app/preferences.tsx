import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeStorage } from "../lib/storage.js";

export type ThemeName = "mocha" | "gruvbox" | "miku";
export type Density = "comfortable" | "compact";

interface Preferences {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  density: Density;
  setDensity: (density: Density) => void;
  showFormulaDetails: boolean;
  setShowFormulaDetails: (value: boolean) => void;
  sidebarCompact: boolean;
  setSidebarCompact: (value: boolean) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useStoredState<ThemeName>("spbu-theme", "gruvbox");
  const [density, setDensity] = useStoredState<Density>("spbu-density", "comfortable");
  const [showFormulaDetails, setShowFormulaDetails] = useStoredState("spbu-formula-details", true);
  const [sidebarCompact, setSidebarCompact] = useStoredState("spbu-sidebar-compact", false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
  }, [theme, density]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      density,
      setDensity,
      showFormulaDetails,
      setShowFormulaDetails,
      sidebarCompact,
      setSidebarCompact,
    }),
    [theme, density, showFormulaDetails, sidebarCompact],
  );
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): Preferences {
  const context = useContext(PreferencesContext);
  if (context === null) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}

function useStoredState<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = safeStorage.getItem(key);
    if (stored === null) return fallback;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    safeStorage.setItem(key, JSON.stringify(next));
  };
  return [value, update];
}
