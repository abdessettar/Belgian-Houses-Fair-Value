import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/context'

// Apply the persisted theme before React mounts to avoid a flash.
(() => {
  let theme: string | null = null;
  try { theme = localStorage.getItem("theme"); } catch { /* private mode */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();

// No StrictMode: dev-only double-mount breaks the imperative MapLibre init.
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
)
