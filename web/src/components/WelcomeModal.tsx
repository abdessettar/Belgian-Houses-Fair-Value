import { useLang } from "../i18n/context";

export function WelcomeModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const w = t.welcome;
  return (
    <div className="about-backdrop" onClick={onClose}>
      <div className="welcome" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{w.title}</h2>
        <p className="welcome-lead">{w.lead}</p>

        <h3>{w.whatYouSeeTitle}</h3>
        <ul>
          <li>
            {w.whatYouSeeIntro}
            <ul>
              <li><span className="inline-chip green" /> {w.chips.stronglyUnder}</li>
              <li><span className="inline-chip teal" /> {w.chips.under}</li>
              <li><span className="inline-chip blue" /> {w.chips.fair}</li>
              <li><span className="inline-chip orange" /> {w.chips.over}</li>
              <li><span className="inline-chip red" /> {w.chips.stronglyOver}</li>
              <li><span className="inline-chip black" /> {w.chips.notPriceable}</li>
            </ul>
          </li>
        </ul>

        <h3>{w.howToTitle}</h3>
        <ul>
          <li>{w.howTo.clickDot}</li>
          <li>{w.howTo.filtersTab}</li>
          <li>{w.howTo.dealsTab}</li>
          <li>{w.howTo.aiSearch}</li>
          <li>{w.howTo.shareable}</li>
        </ul>

        <h3>{w.notTitle}</h3>
        <ul>
          {w.notList.map((line, i) => <li key={i}>{line}</li>)}
        </ul>

        <p className="welcome-cta-row">
          <button type="button" className="welcome-cta" onClick={onClose}>{w.cta}</button>
        </p>
      </div>
    </div>
  );
}
