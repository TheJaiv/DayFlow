import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { KEYS, getItem, setItem } from "@/lib/storage";
import { darkTheme, lightTheme, type Theme } from "./tokens";

export * from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  // Load the saved preference once. Until it arrives the app follows the OS,
  // which is the same thing the majority of users have chosen anyway, so the
  // first paint is almost never wrong.
  useEffect(() => {
    let cancelled = false;
    getItem(KEYS.themeMode).then((saved) => {
      if (!cancelled && (saved === "light" || saved === "dark" || saved === "system")) {
        setModeState(saved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void setItem(KEYS.themeMode, next);
  }, []);

  const theme = useMemo(() => {
    const resolved = mode === "system" ? systemScheme : mode;
    return resolved === "dark" ? darkTheme : lightTheme;
  }, [mode, systemScheme]);

  const value = useMemo(() => ({ theme, mode, setMode }), [theme, mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * Builds a themed stylesheet hook.
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 *   const s = useStyles();
 *
 * The result is memoised per theme object, so flipping to dark mode rebuilds
 * the sheet once rather than on every render.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
) {
  return function useStyles(): T {
    const { theme } = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
