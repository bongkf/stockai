import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load from localStorage or default to "system"
    return localStorage.getItem("theme") || "system";
  });

  // Determine effective theme (system vs explicit)
  const [effectiveTheme, setEffectiveTheme] = useState("dark");

  useEffect(() => {
    // Detect system preference
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const finalTheme = theme === "system" ? systemPreference : theme;
    setEffectiveTheme(finalTheme);

    // Update document root class
    document.documentElement.className = finalTheme === "dark" ? "theme-dark" : "theme-light";

    // Save preference
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const systemPref = mediaQuery.matches ? "dark" : "light";
        setEffectiveTheme(systemPref);
        document.documentElement.className = systemPref === "dark" ? "theme-dark" : "theme-light";
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
