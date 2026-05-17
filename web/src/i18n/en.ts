import type { Locale } from "./types";

const en: Locale = {
  langName: "English",

  app: {
    loading: "Loading listings…",
    toggleFilters: "Toggle filters",
  },

  sidebar: {
    title: "Belgian Houses Fair Value",
    subtitle: "Available houses for sale, priced by ML.",
    aboutModel: "About the model",
    tabs: { filters: "Filters", deals: "Top deals" },
    nl: {
      label: "Describe what you want",
      placeholder: "3 bedrooms near Ghent under 400k with a garden, EPC at least C",
      submit: "AI search",
      submitting: "Cooking…",
    },
    filters: {
      price: "Price (€)",
      surface: "Surface (m²)",
      bedrooms: "Bedrooms",
      daysOnMarket: "Days on market",
      stale: "Stale (>60d)",
      postalCode: "Postal code or its first digits",
      postalCodePlaceholder: "e.g. 10 (Brussels Region), 9000 (Ghent)",
      epcAtLeast: "EPC at least",
      any: "Any",
      garden: "Garden",
      terrace: "Terrace",
      pool: "Pool",
      reset: "Reset filters",
      min: "min",
      max: "max",
    },
    count: (n) => `${n.toLocaleString("en-US")} listings`,
    legend: {
      title: "Listed vs fair value",
      stronglyUnder: "strongly under",
      under: "under",
      fair: "fair",
      over: "over",
      stronglyOver: "strongly over",
      notPriceable: "not priceable",
      notPriceableNote: "outside training distribution",
    },
    deals: {
      empty: "No deals match your current filters :( Go for a walk and come back later :)",
      header: (n, total) =>
        `Top ${n} most-undervalued listings out of ${total.toLocaleString("en-US")} matching your filters. Click any deal to pin it on the map.`,
      save: "save",
      fair: "fair",
    },
  },

  detail: {
    listed: "Listed",
    fairValue: "Fair value",
    delta: "Delta",
    facts: { bed: "bed" },
    domToday: "Listed today.",
    domOne: "1 day on market",
    domMany: (n) => `${n} days on market`,
    domStaleSuffix: " · stale",
    viewOnSource: "View on Immoweb →",
    band: {
      title: "Fair range (80% band)",
      note: (pct) => `±${pct}% typical variance at this listing's features.`,
    },
    drivers: {
      title: "Price drivers",
      narrativeBoth: ({ pos, neg }) =>
        `The fair value is lifted by ${joinEn(pos)}, and held back by ${joinEn(neg)}.`,
      narrativePos: ({ pos }) => `The fair value is mostly driven up by ${joinEn(pos)}.`,
      narrativeNeg: ({ neg }) => `The fair value is held back by ${joinEn(neg)}.`,
      narrativeFlat: "Each feature's contribution to the fair value is small in isolation.",
      showMore: (n) => `Show ${n} more drivers`,
      showFewer: "Show fewer drivers",
      note:
        "Bars show how many euros each feature added to (or removed from) the fair-value estimate, vs. a hypothetical version of this listing where the feature were neutral.",
    },
    comps: {
      title: "Similar listings nearby",
      loading: "Loading similar listings…",
    },
    nonPriceable: {
      verdict: "Not priceable",
      explanation:
        "This listing falls outside the training distribution: typically a life annuity sale, a new real estate project listing, missing crucial features, … The fair value is deliberately not estimated so that no misleading signal is shown.",
      listedPrice: "Listed price:",
      priceOnRequest: "Price on request",
    },
    verdicts: {
      under: "Undervalued",
      over: "Overvalued",
      fair: "Fairly priced",
    },
    formatYes: "yes",
    formatNo: "no",
  },

  about: {
    trigger: "About the model",
    title: "How good is our model?",
    loading: "Loading…",
    intro: (nTest) =>
      `Metrics measured on a temporal held-out test set (${nTest.toLocaleString("en-US")} listings, the most recent slice of the 12-month training window). The lower the Mean Absolute Error (MAE) and median Absolute Percentage Error (APE), the better the model.`,
    transparency:
      "For full transparency, these metrics are stored as workflow artifacts and retrieved after each daily run.",
    table: {
      model: "Model",
      mae: "MAE (€)",
      medianApe: "Median APE",
      r2: "R²",
      ours: "LightGBM (our model)",
      baselines: {
        global_mean: "Global mean",
        commune_median_eur_per_m2: "Commune median €/m²",
        ridge_basic: "Ridge regression",
      },
    },
    bands: {
      title: "Prediction bands",
      body: (coverage, target) =>
        `We report an 80% prediction interval (shown as the blue bar in each listing card) via quantile-regression heads calibrated with split-conformal prediction. Empirical test-set coverage: ${coverage} (target ${target}%).`,
    },
    method: {
      title: "Method in a nutshell (TL;DR)",
      body:
        "LightGBM quantile regression (q=0.025, 0.5, 0.975) with 60-trial Optuna hyper-parameter tuning on a temporal train/val/test split (70/15/15%). Features: raw attributes from the online listings, engineered (property age, distances to 7 Belgian major cities, …), and socioeconomic signals joined by postal code (Statbel median sell price, poverty index, …). Split-conformal calibration on the val set gives the 80% band a distribution-free coverage guarantee.",
    },
  },

  welcome: {
    title: "Belgian Homes Value Estimator",
    lead:
      "A tool that estimates the fair price of every Belgian house for sale on Immoweb and shows, on an interactive map, which listings are priced above or below what our machine learning model expects. With an honest confidence range, not a single point guess. Currently, once a day data updates and the model re-trains on it so the website reflects the market's current state.",
    whatYouSeeTitle: "What you're looking at",
    whatYouSeeIntro:
      "Every coloured dot is a currently-online Belgian house-for-sale listing. The colour tells you how far the listed price is from the model's fair value:",
    chips: {
      stronglyUnder: "strongly under (< −40 %)",
      under: "under (−40 % to −20 %)",
      fair: "fair (±20 %)",
      over: "over (+20 % to +40 %)",
      stronglyOver: "strongly over (> +40 %)",
      notPriceable:
        "active listings the model can't price responsibly: life annuity, new build project, missing crucial features, … A direct link to the listing is included.",
    },
    howToTitle: "How to use it",
    howTo: {
      clickDot:
        "Click a dot to see the listed price vs the model's fair-value range (80 % interval), the main features driving the estimate and how they affect it, 5 nearby comparable listings, the number of days on market, and a link to the Immoweb page.",
      filtersTab:
        "The Filters tab on the left panel narrows the map by price, surface, bedrooms, EPC, postcode prefix, days on market, and more.",
      dealsTab:
        "The Top deals tab on the left panel lists the 20 most undervalued listings matching your current filters: click any to jump to it on the map.",
      aiSearch:
        "AI search: type what you're looking for in plain English, French, or Dutch and the site translates it into filters instantly.",
      shareable:
        "Every view is shareable: the URL encodes your filters and the selected listing, so a copy-paste reproduces exactly what you see.",
    },
    notTitle: "What this site is not",
    notList: [
      "Not financial or investment advice. The estimates and insights provided are for informational purposes only and should not be used as the sole basis for buying, selling, or investing decisions.",
      "This site is independent and is not endorsed by or affiliated with any real-estate marketplace.",
      "Not a real-time feed. Data is refreshed once a day; listing status can change within the day.",
      "Users are solely responsible for how they interpret and use the information provided. We are not liable for any decisions made based on the information.",
    ],
    cta: "Start exploring →",
  },

  features: {
    netHabitableSurface: "Habitable surface",
    constructionYear: "Construction year",
    latitude: "Latitude",
    longitude: "Longitude",
    postalCode: "Postal code",
    postalCode_cat: "Postal code",
    province: "Province",
    bedroomCount: "Bedrooms",
    bathroomCount: "Bathrooms",
    epcScore: "EPC score",
    subType: "Property subtype",
    kitchenType: "Kitchen",
    heatingType: "Heating",
    terraceSurface: "Terrace surface",
    hasGarden: "Garden",
    hasTerrace: "Terrace",
    hasSwimmingPool: "Swimming pool",
    facadeCount: "Facades",
    property_age: "Property age",
    construction_decade: "Construction decade",
    surface_per_bedroom: "Surface per bedroom",
    commune_median_eur_per_m2: "Commune median €/m²",
    dist_brussels: "Distance to Brussels (km)",
    dist_antwerp: "Distance to Antwerp (km)",
    dist_ghent: "Distance to Ghent (km)",
    dist_liege: "Distance to Liège (km)",
    dist_bruges: "Distance to Bruges (km)",
    dist_charleroi: "Distance to Charleroi (km)",
    dist_namur: "Distance to Namur (km)",
    medianSellPrice: "Commune median sell price",
    riskMonetaryPoverty: "Commune poverty index",
    totalPopulation: "Commune population",
    isNewlyBuilt: "New build",
    isNotarySale: "Notary sale",
    hasDoubleGlazing: "Double glazing",
    hasHeatPump: "Heat pump",
    hasPhotovoltaicPanels: "Photovoltaic panels",
    hasThermicPanels: "Thermic panels",
    hasFireplace: "Fireplace",
    hasAttic: "Attic",
    hasBasement: "Basement",
    hasDiningRoom: "Dining room",
    hasLaundryRoom: "Laundry room",
    hasLift: "Lift",
    hasLivingRoom: "Living room",
    hasSauna: "Sauna",
    hasSecureAccessAlarm: "Secure-access alarm",
    gardenOrientation: "Garden orientation",
    terraceOrientation: "Terrace orientation",
    parkingCount: "Parking spaces",
    roomCount: "Total rooms",
    showerRoomCount: "Shower rooms",
    toiletCount: "Toilets",
  },
};

function joinEn(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs[0]} and ${xs[1]}`;
}

export default en;
