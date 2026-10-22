/** Wave 17 (N1): the tabs of the « Finances » page and their names. */
export const financeSections = ["overview", "operations", "budget", "income", "affiliations", "statements", "accounts"] as const;
export type FinanceSection = (typeof financeSections)[number];
export const incomeSections = ["dues", "partners", "grants", "fundraising"] as const;
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
    },
    incomes: { dues: "Cotisations", partners: "Sponsors", grants: "Subsides", fundraising: "Levée de fonds" },
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
    },
    incomes: { dues: "Lidgelden", partners: "Sponsors", grants: "Subsidies", fundraising: "Fondsenwerving" },
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
    },
    incomes: { dues: "Dues", partners: "Sponsors", grants: "Grants", fundraising: "Fundraising" },
  },
} as const;
