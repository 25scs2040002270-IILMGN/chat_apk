import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Theme {
  primaryHsl: string;
  chatBg: string;
  myBubbleBg: string;
  darkMode: boolean;
  fontSize: "sm" | "md" | "lg";
}

const DEFAULT_THEME: Theme = {
  primaryHsl: "173 100% 24%",
  chatBg: "#efeae2",
  myBubbleBg: "#dcf8c6",
  darkMode: false,
  fontSize: "md",
};

export const THEME_PRESETS = [
  { name: "Teal", primaryHsl: "173 100% 24%", myBubbleBg: "#dcf8c6", accent: "#00897B" },
  { name: "Ocean Blue", primaryHsl: "210 85% 42%", myBubbleBg: "#c8e6ff", accent: "#1a6fb5" },
  { name: "Purple", primaryHsl: "262 60% 48%", myBubbleBg: "#e8d5ff", accent: "#7c3aed" },
  { name: "Rose", primaryHsl: "340 75% 48%", myBubbleBg: "#ffd5e0", accent: "#e11d72" },
  { name: "Amber", primaryHsl: "35 90% 42%", myBubbleBg: "#fff0c8", accent: "#d97706" },
  { name: "Forest", primaryHsl: "142 60% 30%", myBubbleBg: "#d0f0c8", accent: "#16803a" },
];

export const CHAT_BG_PRESETS = [
  { name: "Classic", value: "#efeae2" },
  { name: "Sky Blue", value: "#d6e8f5" },
  { name: "Blush Pink", value: "#f5e6ee" },
  { name: "Mint Green", value: "#e2f5eb" },
  { name: "Lavender", value: "#ede8f5" },
  { name: "Warm Sand", value: "#f5f0e8" },
  { name: "Slate Dark", value: "#1e293b" },
  { name: "Pure White", value: "#f8f8f8" },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (partial: Partial<Theme>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", t.primaryHsl);
  root.style.setProperty("--ring", t.primaryHsl);
  root.style.setProperty("--chart-1", t.primaryHsl);
  root.style.setProperty("--chat-bg", t.chatBg);
  root.style.setProperty("--my-bubble-bg", t.myBubbleBg);
  const fontSizeMap = { sm: "13px", md: "15px", lg: "17px" };
  root.style.setProperty("--msg-font-size", fontSizeMap[t.fontSize]);
  if (t.darkMode) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("chat-theme");
      return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (partial: Partial<Theme>) => {
    const next = { ...theme, ...partial };
    setThemeState(next);
    localStorage.setItem("chat-theme", JSON.stringify(next));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
