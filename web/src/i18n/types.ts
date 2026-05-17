// Single source of truth for the i18n shape. Each locale file (en.ts, fr.ts,
// nl.ts) implements `Locale` exactly, so adding a key in one language without
// the others becomes a TypeScript error rather than a silent missing string.
//
// We deliberately keep the structure flat-ish (two levels of nesting at most)
// so call-sites read like `t.sidebar.filters` rather than the deep paths a
// full-blown i18n library would impose. For the ~150 strings this app has,
// hand-rolled is simpler than pulling in i18next and its 30 kB.

export type Lang = "en" | "fr" | "nl";

export type DriverNarrativeArgs = {
  pos: string[];
  neg: string[];
};

export type Locale = {
  // Language switcher tooltip (own name in own language).
  langName: string;

  app: {
    loading: string;
    toggleFilters: string;
  };

  sidebar: {
    title: string;
    subtitle: string;
    aboutModel: string;
    tabs: {
      filters: string;
      deals: string;
    };
    nl: {
      label: string;
      placeholder: string;
      submit: string;
      submitting: string;
    };
    filters: {
      price: string;
      surface: string;
      bedrooms: string;
      daysOnMarket: string;
      stale: string;
      postalCode: string;
      postalCodePlaceholder: string;
      epcAtLeast: string;
      any: string;
      garden: string;
      terrace: string;
      pool: string;
      reset: string;
      min: string;
      max: string;
    };
    count: (n: number) => string;
    legend: {
      title: string;
      stronglyUnder: string;
      under: string;
      fair: string;
      over: string;
      stronglyOver: string;
      notPriceable: string;
      notPriceableNote: string;
    };
    deals: {
      empty: string;
      header: (n: number, total: number) => string;
      save: string;
      fair: string;
    };
  };

  detail: {
    listed: string;
    fairValue: string;
    delta: string;
    facts: {
      bed: string;
    };
    domToday: string;
    domOne: string;
    domMany: (n: number) => string;
    domStaleSuffix: string;
    viewOnSource: string;
    band: {
      title: string;
      note: (pct: number) => string;
    };
    drivers: {
      title: string;
      narrativeBoth: (args: DriverNarrativeArgs) => string;
      narrativePos: (args: DriverNarrativeArgs) => string;
      narrativeNeg: (args: DriverNarrativeArgs) => string;
      narrativeFlat: string;
      showMore: (n: number) => string;
      showFewer: string;
      note: string;
    };
    comps: {
      title: string;
      loading: string;
    };
    nonPriceable: {
      verdict: string;
      explanation: string;
      listedPrice: string;
      priceOnRequest: string;
    };
    verdicts: {
      under: string;
      over: string;
      fair: string;
    };
    formatYes: string;
    formatNo: string;
  };

  about: {
    trigger: string;
    title: string;
    loading: string;
    intro: (nTest: number) => string;
    transparency: string;
    table: {
      model: string;
      mae: string;
      medianApe: string;
      r2: string;
      ours: string;
      baselines: {
        global_mean: string;
        commune_median_eur_per_m2: string;
        ridge_basic: string;
      };
    };
    bands: {
      title: string;
      body: (coverage: string, target: number) => string;
    };
    method: {
      title: string;
      body: string;
    };
  };

  welcome: {
    title: string;
    lead: string;
    whatYouSeeTitle: string;
    whatYouSeeIntro: string;
    chips: {
      stronglyUnder: string;
      under: string;
      fair: string;
      over: string;
      stronglyOver: string;
      notPriceable: string;
    };
    howToTitle: string;
    howTo: {
      clickDot: string;
      filtersTab: string;
      dealsTab: string;
      aiSearch: string;
      shareable: string;
    };
    notTitle: string;
    notList: string[];
    cta: string;
  };

  // Display label for each SHAP feature. Used both in the per-listing driver
  // list and in the auto-generated narrative sentence.
  features: Record<string, string>;
};
