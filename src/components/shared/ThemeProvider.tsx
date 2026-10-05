import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";
interface ThemeState {
  theme: Theme;
  systemTheme: "light" | "dark";
  resolvedTheme: "light" | "dark";
  setTheme(value: string): void;
}
const ThemeContext = createContext<ThemeState | null>(null);

// Theme preferences are loaded by WorkspacePreferences from PostgreSQL.
// Rendering state stays in memory, including on the public landing page.
export function ThemeProvider({ children, forcedTheme }: { children: ReactNode; forcedTheme?: "light" }) {
  const [theme, updateTheme] = useState<Theme>("light");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const setTheme = useCallback((value: string) => {
    if (value === "light" || value === "dark" || value === "system") updateTheme(value);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemTheme(query.matches ? "dark" : "light");
    apply(); query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  const resolvedTheme = forcedTheme ?? (theme === "system" ? systemTheme : theme);
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  const value = useMemo(() => ({ theme, systemTheme, resolvedTheme, setTheme }), [theme, systemTheme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme requires ThemeProvider");
  return value;
}
