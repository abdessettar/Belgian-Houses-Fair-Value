import { useLang } from "../i18n/context";
import type { Lang } from "../i18n/types";

const ORDER: Lang[] = ["en", "fr", "nl"];

export function LanguageToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label={t.langName}>
      {ORDER.map((l) => (
        <button
          key={l}
          type="button"
          className={"lang-btn" + (l === lang ? " active" : "")}
          onClick={() => setLang(l)}
          aria-pressed={l === lang}
          title={l.toUpperCase()}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
