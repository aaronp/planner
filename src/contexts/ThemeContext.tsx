import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextType = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    actualTheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem("theme");
        return (stored as Theme) || "system";
    });

    const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        localStorage.setItem("theme", theme);

        const root = window.document.documentElement;
        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
            root.classList.add(systemTheme);
            setActualTheme(systemTheme);
        } else {
            root.classList.add(theme);
            setActualTheme(theme);
        }
    }, [theme]);

    // Listen to system theme changes when in system mode
    useEffect(() => {
        if (theme !== "system") return;

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            const systemTheme = mediaQuery.matches ? "dark" : "light";
            const root = window.document.documentElement;
            root.classList.remove("light", "dark");
            root.classList.add(systemTheme);
            setActualTheme(systemTheme);
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
