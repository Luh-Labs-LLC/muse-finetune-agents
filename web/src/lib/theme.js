// Light, dark, or whatever the system says. "system" means no data-theme at all, so CSS's prefers-color-scheme decides.
// `dark` is what's showing now either way, for the night mode switch.
import { useEffect, useState } from "react";

const query = "(prefers-color-scheme: dark)";

function saved() {
  try { return localStorage.getItem("theme") || "system"; } catch { return "system"; }
}

export function useTheme() {
  const [theme, setTheme] = useState(saved);
  const [systemDark, setSystemDark] = useState(() => matchMedia(query).matches);

  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch { /* private windows can refuse storage; the choice still holds until the page closes */ }
  }, [theme]);

  const dark = theme === "system" ? systemDark : theme === "dark";
  return { theme, dark, setTheme };
}
