import type { Locale } from "./types";

const fr: Locale = {
  langName: "Français",

  app: {
    loading: "Chargement des annonces…",
    toggleFilters: "Afficher / masquer les filtres",
  },

  sidebar: {
    title: "Valeur Maisons Belges",
    subtitle: "Maisons à vendre, estimées par un modèle de ML.",
    aboutModel: "À propos du modèle",
    tabs: { filters: "Filtres", deals: "Bonnes affaires" },
    nl: {
      label: "Décrivez ce que vous cherchez",
      placeholder: "2 chambres près de Uccle sous 400k avec jardin, EPC au moins C",
      submit: "Recherche IA",
      submitting: "Réflexion…",
    },
    filters: {
      price: "Prix (€)",
      surface: "Superficie (m²)",
      bedrooms: "Chambres",
      daysOnMarket: "Jours sur le marché",
      stale: "Anciens (>60j)",
      postalCode: "Code postal ou ses premiers chiffres",
      postalCodePlaceholder: "ex. 10 (Région Bruxelloise), 9000 (Gand)",
      epcAtLeast: "EPC au moins",
      any: "Tous",
      garden: "Jardin",
      terrace: "Terrasse",
      pool: "Piscine",
      reset: "Réinitialiser les filtres",
      min: "min",
      max: "max",
    },
    count: (n) => `${n.toLocaleString("fr-BE")} annonces`,
    legend: {
      title: "Prix demandé vs valeur estimée",
      stronglyUnder: "fortement sous-évaluée",
      under: "sous-évaluée",
      fair: "juste",
      over: "sur-évaluée",
      stronglyOver: "fortement sur-évaluée",
      notPriceable: "non estimable",
      notPriceableNote: "hors distribution d'entraînement",
    },
    deals: {
      empty: "Aucune offre ne correspond à vos filtres :( Allez vous promener et revenez plus tard :)",
      header: (n, total) =>
        `Top ${n} des annonces les plus sous-évaluées sur ${total.toLocaleString("fr-BE")} correspondant à vos filtres. Cliquez sur une annonce pour la localiser sur la carte.`,
      save: "économisez",
      fair: "juste",
    },
  },

  detail: {
    listed: "demandé",
    fairValue: "Valeur estimée",
    delta: "Écart",
    facts: { bed: "ch." },
    domToday: "Publiée aujourd'hui.",
    domOne: "1 jour sur le marché",
    domMany: (n) => `${n} jours sur le marché`,
    domStaleSuffix: " · ancien",
    viewOnSource: "Voir sur Immoweb →",
    band: {
      title: "Fourchette estimée (intervalle 80%)",
      note: (pct) => `±${pct}% de variance typique pour les caractéristiques de cette maison.`,
    },
    drivers: {
      title: "Facteurs clés de l'estimation",
      narrativeBoth: ({ pos, neg }) =>
        `La valeur estimée est tirée vers le haut par ${joinFr(pos)}, et freinée par ${joinFr(neg)}.`,
      narrativePos: ({ pos }) => `La valeur estimée est principalement portée par ${joinFr(pos)}.`,
      narrativeNeg: ({ neg }) => `La valeur estimée est réduite par ${joinFr(neg)}.`,
      narrativeFlat: "La contribution de chaque caractéristique à la valeur estimée est faible isolément.",
      showMore: (n) => `Voir ${n} facteurs de plus`,
      showFewer: "Voir moins de facteurs",
      note:
        "Les barres montrent combien d'euros chaque caractéristique a ajouté (ou retiré) à la valeur estimée, par rapport à une version hypothétique de cette maison où la caractéristique serait neutre.",
    },
    comps: {
      title: "Maisons similaires à proximité",
      loading: "Chargement des maisons similaires…",
    },
    nonPriceable: {
      verdict: "Non estimable",
      explanation:
        "Cette annonce sort de la distribution d'entraînement : généralement une vente en viager, un projet immobilier en cours, des caractéristiques manquantes,… La valeur estimée est délibérément masquée pour ne pas donner un signal trompeur.",
      listedPrice: "Prix annoncé :",
      priceOnRequest: "Prix sur demande",
    },
    verdicts: {
      under: "Sous-évaluée",
      over: "Sur-évaluée",
      fair: "Evaluation juste",
    },
    formatYes: "oui",
    formatNo: "non",
  },

  about: {
    trigger: "À propos du modèle",
    title: "Quelle est la qualité de notre modèle ?",
    loading: "Chargement…",
    intro: (nTest) =>
      `Métriques mesurées sur un jeu de test temporel mis de côté (${nTest.toLocaleString("fr-BE")} annonces, la tranche la plus récente de la période d'entraînement de 12 mois). Plus l'erreur absolue moyenne (MAE) et le pourcentage d'erreur absolue médiane (APE) sont faibles, meilleur est le modèle.`,
    transparency:
      "Pour une transparence totale, ces métriques sont stockées comme artefacts du workflow et récupérées après chaque exécution quotidienne.",
    table: {
      model: "Modèle",
      mae: "MAE (€)",
      medianApe: "APE médiane",
      r2: "R²",
      ours: "LightGBM (notre modèle)",
      baselines: {
        global_mean: "Moyenne globale",
        commune_median_eur_per_m2: "Médiane communale €/m²",
        ridge_basic: "Régression Ridge",
      },
    },
    bands: {
      title: "Intervalles de prédiction",
      body: (coverage, target) =>
        `Nous publions un intervalle de prédiction à 80% (la barre bleue sur le panneau de chaque annonce) via des têtes de régression quantile calibrées par prédiction conforme par découpage. Couverture empirique sur le test : ${coverage} (cible ${target}%).`,
    },
    method: {
      title: "Méthode en quelques mots (TL;DR)",
      body:
        "Régression quantile LightGBM (q=0.025, 0.5, 0.975) avec un réglage d'hyperparamètres Optuna sur 60 essais, sur un découpage temporel train/val/test (70/15/15%). Caractéristiques : attributs bruts des annonces, calculés (âge du bien, distances prp à 7 grandes villes belges, …), et données socio-économiques jointes par code postal (prix médian de vente via Statbel, indice de pauvreté, …). La calibration conforme par découpage sur le set de validation donne à l'intervalle 80% une garantie de couverture sans hypothèse de distribution.",
    },
  },

  welcome: {
    title: "Estimation de la Valeur des Maisons Belges",
    lead:
      "Un outil qui estime le prix juste de chaque maison à vendre en Belgique sur Immoweb et montre, sur une carte interactive, quelles annonces sont au-dessus ou en-dessous de ce que notre modèle de machine learning attend. Avec une fourchette de confiance honnête, pas une simple estimation ponctuelle. Actuellement, les données sont mises à jour une fois par jour et le modèle est ré-entraîné dessus, pour que le site reflète l'état actuel du marché.",
    whatYouSeeTitle: "Ce que vous voyez",
    whatYouSeeIntro:
      "Chaque point coloré est une annonce de maison à vendre actuellement en ligne en Belgique. La couleur indique de combien le prix annoncé s'écarte de la valeur estimée par le modèle :",
    chips: {
      stronglyUnder: "fortement sous-évaluée (< −40 %)",
      under: "sous-évaluée (−40 % à −20 %)",
      fair: "juste (±20 %)",
      over: "sur-évaluée (+20 % à +40 %)",
      stronglyOver: "fortement sur-évaluée (> +40 %)",
      notPriceable:
        "annonces actives que le modèle ne peut pas évaluer de façon responsable : viager, projet neuf, caractéristiques manquantes, … Un lien direct vers l'annonce est inclus.",
    },
    howToTitle: "Comment l'utiliser",
    howTo: {
      clickDot:
        "Cliquez sur un point pour voir le prix annoncé vs la fourchette estimée par le modèle (intervalle 80 %), les principales caractéristiques qui influencent l'estimation et leur impact, 5 annonces comparables à proximité, le nombre de jours sur le marché, et un lien vers la page Immoweb.",
      filtersTab:
        "L'onglet Filtres dans le panneau de gauche affine la carte par prix, surface, chambres, EPC, préfixe de code postal, jours sur le marché, et plus.",
      dealsTab:
        "L'onglet Bonnes affaires dans le panneau de gauche liste les 20 annonces les plus sous-évaluées correspondant à vos filtres : cliquez sur l'une d'elles pour la localiser sur la carte.",
      aiSearch:
        "Recherche IA : tapez ce que vous cherchez en français, anglais ou néerlandais et le site le traduit instantanément en filtres.",
      shareable:
        "Chaque vue est partageable : l'URL encode vos filtres et l'annonce sélectionnée, un copier-coller reproduit exactement ce que vous voyez.",
    },
    notTitle: "Ce que ce site n'est pas",
    notList: [
      "Pas un conseil financier ou en investissement. Les estimations et indications fournies le sont à titre informatif uniquement et ne devraient pas servir de base unique pour des décisions d'achat, de vente ou d'investissement.",
      "Ce site est indépendant et n'est ni soutenu ni affilié à un quelconque acteur immobilier (ou autre).",
      "Pas màj en temps réel. Les données sont rafraîchies une fois par jour; le statut d'une annonce peut changer dans la journée.",
      "Les utilisateurs sont seuls responsables de la manière dont ils interprètent et utilisent les informations fournies. Nous ne sommes pas responsables des décisions prises sur la base de ces informations.",
    ],
    cta: "Commencer l'exploration →",
  },

  features: {
    netHabitableSurface: "Surface habitable",
    constructionYear: "Année de construction",
    latitude: "Latitude",
    longitude: "Longitude",
    postalCode: "Code postal",
    postalCode_cat: "Code postal",
    province: "Province",
    bedroomCount: "Chambres",
    bathroomCount: "Salles de bain",
    epcScore: "Score EPC",
    subType: "Sous-type de bien",
    kitchenType: "Cuisine",
    heatingType: "Chauffage",
    terraceSurface: "Surface de terrasse",
    hasGarden: "Jardin",
    hasTerrace: "Terrasse",
    hasSwimmingPool: "Piscine",
    facadeCount: "Façades",
    property_age: "Âge du bien",
    construction_decade: "Décennie de construction",
    surface_per_bedroom: "Surface par chambre",
    commune_median_eur_per_m2: "Médiane communale €/m²",
    dist_brussels: "Distance à Bruxelles (km)",
    dist_antwerp: "Distance à Anvers (km)",
    dist_ghent: "Distance à Gand (km)",
    dist_liege: "Distance à Liège (km)",
    dist_bruges: "Distance à Bruges (km)",
    dist_charleroi: "Distance à Charleroi (km)",
    dist_namur: "Distance à Namur (km)",
    medianSellPrice: "Prix médian de vente communal",
    riskMonetaryPoverty: "Indice de pauvreté communal",
    totalPopulation: "Population communale",
    isNewlyBuilt: "Neuf",
    isNotarySale: "Vente notariale",
    hasDoubleGlazing: "Double vitrage",
    hasHeatPump: "Pompe à chaleur",
    hasPhotovoltaicPanels: "Panneaux photovoltaïques",
    hasThermicPanels: "Panneaux thermiques",
    hasFireplace: "Cheminée",
    hasAttic: "Grenier",
    hasBasement: "Cave",
    hasDiningRoom: "Salle à manger",
    hasLaundryRoom: "Buanderie",
    hasLift: "Ascenseur",
    hasLivingRoom: "Salon",
    hasSauna: "Sauna",
    hasSecureAccessAlarm: "Alarme d'accès sécurisé",
    gardenOrientation: "Orientation du jardin",
    terraceOrientation: "Orientation de la terrasse",
    parkingCount: "Places de parking",
    roomCount: "Nombre total de pièces",
    showerRoomCount: "Salles de douche",
    toiletCount: "Toilettes",
  },
};

function joinFr(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs[0]} et ${xs[1]}`;
}

export default fr;
