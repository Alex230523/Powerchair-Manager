/** Wave 17 (N1): the tabs of the « Finances » page and their names. */
/** « tax » (B8) shows only for a club approved for tax receipts. */
export const financeSections = ["overview", "operations", "budget", "reserved", "affiliations", "statements", "accounts", "tax"] as const;
export type FinanceSection = (typeof financeSections)[number];

export const financeNavCopy = {
  fr: {
    label: "Sections des finances",
    sections: {
      overview: "Vue d'ensemble",
      operations: "Opérations",
      budget: "Budget",
      reserved: "Fonds réservés",
      affiliations: "Affiliations",
      statements: "Relevés de compte",
      accounts: "Comptes annuels et rapports",
      tax: "Attestations fiscales",
    },
  },
  nl: {
    label: "Onderdelen van de financiën",
    sections: {
      overview: "Overzicht",
      operations: "Verrichtingen",
      budget: "Begroting",
      reserved: "Bestemde fondsen",
      affiliations: "Aansluitingen",
      statements: "Rekeningafschriften",
      accounts: "Jaarrekening en verslagen",
      tax: "Fiscale attesten",
    },
  },
  en: {
    label: "Finance sections",
    sections: {
      overview: "Overview",
      operations: "Operations",
      budget: "Budget",
      reserved: "Reserved funds",
      affiliations: "Affiliations",
      statements: "Bank statements",
      accounts: "Annual accounts and reports",
      tax: "Tax receipts",
    },
  },
} as const;
