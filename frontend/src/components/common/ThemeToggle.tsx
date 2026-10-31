import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="qn-icon-button qn-theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {theme === "dark" ? (
        <Sun size={24} strokeWidth={1.7} aria-hidden="true" />
      ) : (
        <Moon
          size={24}
          fill="currentColor"
          strokeWidth={0}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
