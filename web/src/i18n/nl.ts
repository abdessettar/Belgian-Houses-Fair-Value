import type { Locale } from "./types";

const nl: Locale = {
  langName: "Nederlands",

  app: {
    loading: "Aanbiedingen laden…",
    toggleFilters: "Filters tonen / verbergen",
  },

  sidebar: {
    title: "Faire Waarde Belgische Woningen",
    subtitle: "Te koop staande huizen, geprijsd door ML.",
    aboutModel: "Over het model",
    tabs: { filters: "Filters", deals: "Topkoopjes" },
    nl: {
      label: "Beschrijf wat u zoekt",
      placeholder: "3 slaapkamers nabij Gent onder 400k met tuin, EPC minstens C",
      submit: "AI-zoeken",
      submitting: "Bezig…",
    },
    filters: {
      price: "Prijs (€)",
      surface: "Oppervlakte (m²)",
      bedrooms: "Slaapkamers",
      daysOnMarket: "Dagen op de markt",
      stale: "Oud (>60d)",
      postalCode: "Postcode of de eerste cijfers",
      postalCodePlaceholder: "bv. 10 (Brussels Gewest), 9000 (Gent)",
      epcAtLeast: "EPC minstens",
      any: "Alle",
      garden: "Tuin",
      terrace: "Terras",
      pool: "Zwembad",
      reset: "Filters wissen",
      min: "min",
      max: "max",
    },
    count: (n) => `${n.toLocaleString("nl-BE")} aanbiedingen`,
    legend: {
      title: "Vraagprijs vs faire waarde",
      stronglyUnder: "sterk onder",
      under: "onder",
      fair: "fair",
      over: "boven",
      stronglyOver: "sterk boven",
      notPriceable: "niet te prijzen",
      notPriceableNote: "buiten de trainingsverdeling",
    },
    deals: {
      empty: "Geen koopjes komen overeen met uw filters :( Ga even wandelen en kom later terug :)",
      header: (n, total) =>
        `Top ${n} meest ondergewaardeerde aanbiedingen op ${total.toLocaleString("nl-BE")} die overeenkomen met uw filters. Klik op een aanbieding om die op de kaart te tonen.`,
      save: "bespaar",
      fair: "fair",
    },
  },

  detail: {
    listed: "Vraagprijs",
    fairValue: "Faire waarde",
    delta: "Verschil",
    facts: { bed: "slpk." },
    domToday: "Vandaag geplaatst.",
    domOne: "1 dag op de markt",
    domMany: (n) => `${n} dagen op de markt`,
    domStaleSuffix: " · oud",
    viewOnSource: "Bekijk op Immoweb →",
    band: {
      title: "Faire prijsvork (80%-interval)",
      note: (pct) => `±${pct}% typische variantie voor de kenmerken van deze aanbieding.`,
    },
    drivers: {
      title: "Prijsfactoren",
      narrativeBoth: ({ pos, neg }) =>
        `De faire waarde wordt verhoogd door ${joinNl(pos)}, en gedrukt door ${joinNl(neg)}.`,
      narrativePos: ({ pos }) => `De faire waarde wordt vooral opgetrokken door ${joinNl(pos)}.`,
      narrativeNeg: ({ neg }) => `De faire waarde wordt gedrukt door ${joinNl(neg)}.`,
      narrativeFlat: "De bijdrage van elk kenmerk aan de faire waarde is afzonderlijk klein.",
      showMore: (n) => `Toon ${n} factoren meer`,
      showFewer: "Toon minder factoren",
      note:
        "De balken tonen hoeveel euro elk kenmerk heeft toegevoegd aan (of afgetrokken van) de faire waarde, ten opzichte van een hypothetische versie van deze aanbieding waarbij dat kenmerk neutraal zou zijn.",
    },
    comps: {
      title: "Vergelijkbare aanbiedingen in de buurt",
      loading: "Vergelijkbare aanbiedingen laden…",
    },
    nonPriceable: {
      verdict: "Niet te prijzen",
      explanation:
        "Deze aanbieding valt buiten de trainingsverdeling: meestal een lijfrenteverkoop, een nieuwbouwproject, ontbrekende kerngegevens, … De faire waarde wordt bewust niet geschat zodat geen misleidend signaal wordt getoond.",
      listedPrice: "Vraagprijs:",
      priceOnRequest: "Prijs op aanvraag",
    },
    verdicts: {
      under: "Ondergewaardeerd",
      over: "Overgewaardeerd",
      fair: "Eerlijk geprijsd",
    },
    formatYes: "ja",
    formatNo: "nee",
  },

  about: {
    trigger: "Over het model",
    title: "Hoe goed is ons model?",
    loading: "Laden…",
    intro: (nTest) =>
      `Metrieken gemeten op een temporeel afgezonderde testset (${nTest.toLocaleString("nl-BE")} aanbiedingen, het meest recente deel van het trainingsvenster van 12 maanden). Hoe lager de Mean Absolute Error (MAE) en de mediaan Absolute Percentage Error (APE), hoe beter het model.`,
    transparency:
      "Voor volledige transparantie worden deze metrieken bewaard als workflow-artifacten en opgehaald na elke dagelijkse run.",
    table: {
      model: "Model",
      mae: "MAE (€)",
      medianApe: "Mediane APE",
      r2: "R²",
      ours: "LightGBM (ons model)",
      baselines: {
        global_mean: "Globaal gemiddelde",
        commune_median_eur_per_m2: "Mediaan per gemeente €/m²",
        ridge_basic: "Ridge-regressie",
      },
    },
    bands: {
      title: "Voorspellingsintervallen",
      body: (coverage, target) =>
        `We rapporteren een voorspellingsinterval van 80% (de blauwe balk op elke kaart) via kwantielregressie-koppen, gekalibreerd met split-conformale voorspelling. Empirische dekking op de testset: ${coverage} (doel ${target}%).`,
    },
    method: {
      title: "Methode in een notendop (TL;DR)",
      body:
        "LightGBM kwantielregressie (q=0,025, 0,5, 0,975) met 60 Optuna-hyperparameter-trials op een temporele train/val/test-split (70/15/15%). Kenmerken: ruwe attributen uit de online aanbiedingen, afgeleide kenmerken (leeftijd van het pand, afstanden tot 7 grote Belgische steden, …) en sociaaleconomische signalen gekoppeld via postcode (Statbel mediane verkoopprijs, armoede-index, …). Split-conformale kalibratie op de validatieset geeft het 80%-interval een verdelingsvrije dekkingsgarantie.",
    },
  },

  welcome: {
    title: "Schatter Faire Waarde Belgische Woningen",
    lead:
      "Een tool die de faire prijs schat van elk in België te koop staand huis op Immoweb en op een interactieve kaart toont welke aanbiedingen boven of onder de verwachting van ons machine-learningmodel zitten. Met een eerlijke betrouwbaarheidsmarge, niet één enkele puntschatting. De data wordt momenteel eenmaal per dag bijgewerkt en het model wordt erop hertraind, zodat de site de huidige toestand van de markt weergeeft.",
    whatYouSeeTitle: "Wat u ziet",
    whatYouSeeIntro:
      "Elk gekleurd punt is een momenteel online te koop staand Belgisch huis. De kleur geeft aan hoever de vraagprijs af staat van de faire waarde van het model:",
    chips: {
      stronglyUnder: "sterk onder (< −40 %)",
      under: "onder (−40 % tot −20 %)",
      fair: "fair (±20 %)",
      over: "boven (+20 % tot +40 %)",
      stronglyOver: "sterk boven (> +40 %)",
      notPriceable:
        "actieve aanbiedingen die het model niet verantwoord kan prijzen: lijfrenteverkoop, nieuwbouwproject, ontbrekende kerngegevens, … Een directe link naar de aanbieding is inbegrepen.",
    },
    howToTitle: "Hoe te gebruiken",
    howTo: {
      clickDot:
        "Klik op een punt om de vraagprijs te zien naast de faire prijsvork van het model (interval van 80 %), de belangrijkste kenmerken die de schatting bepalen en hun invloed, 5 vergelijkbare aanbiedingen in de buurt, het aantal dagen op de markt, en een link naar de Immoweb-pagina.",
      filtersTab:
        "Het tabblad Filters in het linkerpaneel beperkt de kaart op prijs, oppervlakte, slaapkamers, EPC, postcode-prefix, dagen op de markt en meer.",
      dealsTab:
        "Het tabblad Topkoopjes in het linkerpaneel toont de 20 meest ondergewaardeerde aanbiedingen die aan uw filters voldoen: klik op een ervan om die op de kaart te tonen.",
      aiSearch:
        "AI-zoeken: typ wat u zoekt in het Engels, Frans of Nederlands en de site vertaalt het direct naar filters.",
      shareable:
        "Elke weergave is deelbaar: de URL bevat uw filters en de geselecteerde aanbieding, dus een kopieer-plak reproduceert precies wat u ziet.",
    },
    notTitle: "Wat deze site niet is",
    notList: [
      "Geen financieel of beleggingsadvies. De geleverde schattingen en inzichten zijn uitsluitend ter informatie en mogen niet de enige basis vormen voor koop-, verkoop- of beleggingsbeslissingen.",
      "Deze site is onafhankelijk en wordt niet onderschreven door of geaffilieerd met enige vastgoedmarktplaats.",
      "Geen real-time feed. De data wordt eenmaal per dag vernieuwd; de status van een aanbieding kan binnen de dag wijzigen.",
      "Gebruikers zijn zelf verantwoordelijk voor de manier waarop zij de geleverde informatie interpreteren en gebruiken. Wij zijn niet aansprakelijk voor beslissingen genomen op basis van die informatie.",
    ],
    cta: "Beginnen met verkennen →",
  },

  features: {
    netHabitableSurface: "Bewoonbare oppervlakte",
    constructionYear: "Bouwjaar",
    latitude: "Breedtegraad",
    longitude: "Lengtegraad",
    postalCode: "Postcode",
    postalCode_cat: "Postcode",
    province: "Provincie",
    bedroomCount: "Slaapkamers",
    bathroomCount: "Badkamers",
    epcScore: "EPC-score",
    subType: "Soort woning",
    kitchenType: "Keuken",
    heatingType: "Verwarming",
    terraceSurface: "Terrasoppervlakte",
    hasGarden: "Tuin",
    hasTerrace: "Terras",
    hasSwimmingPool: "Zwembad",
    facadeCount: "Gevels",
    property_age: "Leeftijd van het pand",
    construction_decade: "Bouwperiode (decennium)",
    surface_per_bedroom: "Oppervlakte per slaapkamer",
    commune_median_eur_per_m2: "Mediaan per gemeente €/m²",
    dist_brussels: "Afstand tot Brussel (km)",
    dist_antwerp: "Afstand tot Antwerpen (km)",
    dist_ghent: "Afstand tot Gent (km)",
    dist_liege: "Afstand tot Luik (km)",
    dist_bruges: "Afstand tot Brugge (km)",
    dist_charleroi: "Afstand tot Charleroi (km)",
    dist_namur: "Afstand tot Namen (km)",
    medianSellPrice: "Mediane verkoopprijs gemeente",
    riskMonetaryPoverty: "Armoede-index gemeente",
    totalPopulation: "Bevolking gemeente",
    isNewlyBuilt: "Nieuwbouw",
    isNotarySale: "Notariële verkoop",
    hasDoubleGlazing: "Dubbele beglazing",
    hasHeatPump: "Warmtepomp",
    hasPhotovoltaicPanels: "Fotovoltaïsche panelen",
    hasThermicPanels: "Thermische panelen",
    hasFireplace: "Open haard",
    hasAttic: "Zolder",
    hasBasement: "Kelder",
    hasDiningRoom: "Eetkamer",
    hasLaundryRoom: "Waskamer",
    hasLift: "Lift",
    hasLivingRoom: "Woonkamer",
    hasSauna: "Sauna",
    hasSecureAccessAlarm: "Beveiligd-toegangsalarm",
    gardenOrientation: "Tuinoriëntatie",
    terraceOrientation: "Terrasoriëntatie",
    parkingCount: "Parkeerplaatsen",
    roomCount: "Totaal aantal kamers",
    showerRoomCount: "Doucheruimtes",
    toiletCount: "Toiletten",
  },
};

function joinNl(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs[0]} en ${xs[1]}`;
}

export default nl;
