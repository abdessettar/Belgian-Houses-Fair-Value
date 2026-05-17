import { useEffect, useState } from "react";
import { useLang } from "../i18n/context";

// Fetches metrics.json (emitted by 02_train_model.py) for a baselines-vs-LGBM table.
type Metrics = {
  split: { n_train: number; n_val: number; n_test: number; scheme: string };
  baselines: Record<string, { mae_eur: number; median_ape: number; r2: number }>;
  lightgbm: {
    mae_eur: number; median_ape: number; r2: number;
    coverage_80pct_raw?: number;
    coverage_80pct_conformal?: number;
    coverage_80pct_calibrated?: number;
    conformal_q_hat_eur?: number;
    target_coverage?: number;
  };
};

export function AboutModel() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (!open || metrics) return;
    fetch("/metrics.json").then((r) => r.json()).then(setMetrics).catch(() => { /* */ });
  }, [open, metrics]);

  return (
    <>
      <button type="button" className="about-trigger" onClick={() => setOpen(true)}
        title={t.about.title}>
        {t.about.trigger}
      </button>
      {open && (
        <div className="about-backdrop" onClick={() => setOpen(false)}>
          <div className="about" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpen(false)}>×</button>
            <h2>{t.about.title}</h2>
            {metrics == null ? (
              <p>{t.about.loading}</p>
            ) : (
              <AboutContent metrics={metrics} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AboutContent({ metrics }: { metrics: Metrics }) {
  const { t } = useLang();
  const lgbm = metrics.lightgbm;
  const coverage = lgbm.coverage_80pct_conformal ?? lgbm.coverage_80pct_calibrated;
  const baselineLabels = t.about.table.baselines;
  const rows = [
    ...Object.entries(metrics.baselines).map(([k, v]) => ({
      name: (baselineLabels as Record<string, string>)[k] ?? k,
      mae: v.mae_eur,
      medape: v.median_ape,
      r2: v.r2,
      bold: false,
    })),
    {
      name: t.about.table.ours,
      mae: lgbm.mae_eur,
      medape: lgbm.median_ape,
      r2: lgbm.r2,
      bold: true,
    },
  ];
  const coverageStr = coverage != null ? (coverage * 100).toFixed(1) + "%" : "—";
  const targetPct = (lgbm.target_coverage ?? 0.8) * 100;
  return (
    <>
      <p>
        <em>{t.about.transparency}</em><br />
        {t.about.intro(metrics.split.n_test)}
      </p>
      <table className="about-table">
        <thead>
          <tr>
            <th>{t.about.table.model}</th>
            <th>{t.about.table.mae}</th>
            <th>{t.about.table.medianApe}</th>
            <th>{t.about.table.r2}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.bold ? "bold" : ""}>
              <td>{r.name}</td>
              <td>{r.mae.toLocaleString()}</td>
              <td>{(r.medape * 100).toFixed(1)}%</td>
              <td>{r.r2.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{t.about.bands.title}</h3>
      <p>{t.about.bands.body(coverageStr, targetPct)}</p>
      <h3>{t.about.method.title}</h3>
      <p>{t.about.method.body}</p>
    </>
  );
}
