/** Wave 17 (N1): the tabs of the « Finances » page and their names. */
/** « tax » (B8) shows only for a club approved for tax receipts. */
export const financeSections = ["overview", "operations", "budget", "income", "affiliations", "statements", "accounts", "tax"] as const;
export type FinanceSection = (typeof financeSections)[number];
export const incomeSections = ["dues", "support", "fundraising"] as const;
export type IncomeSection = (typeof incomeSections)[number];

export const financeNavCopy = {
  fr: {
    label: "Sections des finances",
    income: "Rentrées",
    sections: {
      overview: "Vue d'ensemble",
      operations: "Opérations",
      budget: "Budget",
      income: "Rentrées",
      affiliations: "Affiliations",
      statements: "Relevés de compte",
      accounts: "Comptes annuels et rapports",
      tax: "Attestations fiscales",
    },
    incomes: { dues: "Cotisations", support: "Subsides & sponsors", fundraising: "Levée de fonds" },
  },
  nl: {
    label: "Onderdelen van de financiën",
    income: "Inkomsten",
    sections: {
      overview: "Overzicht",
      operations: "Verrichtingen",
      budget: "Begroting",
      income: "Inkomsten",
      affiliations: "Aansluitingen",
      statements: "Rekeningafschriften",
      accounts: "Jaarrekening en verslagen",
      tax: "Fiscale attesten",
    },
    incomes: { dues: "Lidgelden", support: "Subsidies & sponsors", fundraising: "Fondsenwerving" },
  },
  en: {
    label: "Finance sections",
    income: "Income",
    sections: {
      overview: "Overview",
      operations: "Operations",
      budget: "Budget",
      income: "Income",
      affiliations: "Affiliations",
      statements: "Bank statements",
      accounts: "Annual accounts and reports",
      tax: "Tax receipts",
    },
    incomes: { dues: "Dues", support: "Grants & sponsors", fundraising: "Fundraising" },
  },
} as const;
