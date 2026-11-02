/** 16: the « Nouvelle saison » email proposed by the assistant, in the president's language (fr, nl, en). */
export const newSeasonMail = {
  fr: {
    subject: "Nouvelle saison {season} : {club}",
    text: "Bonjour,\n\nLa saison {season} commence le {date}. Vous retrouverez dans l'application les équipes, le calendrier et les cotisations.\n\nÀ bientôt sur le terrain !",
  },
  nl: {
    subject: "Nieuw seizoen {season}: {club}",
    text: "Hallo,\n\nHet seizoen {season} begint op {date}. In de app vindt u de teams, de kalender en de bijdragen.\n\nTot snel op het veld!",
  },
  en: {
    subject: "New season {season}: {club}",
    text: "Hello,\n\nThe {season} season starts on {date}. You will find the teams, the calendar and the dues in the app.\n\nSee you soon on the pitch!",
  },
} as const;
/** 16: the titles of the tasks the assistant creates, in the president's language. */
export const planTaskTitles = {
  fr: { affiliation: "Affiliation {name} {period}", grant: "Redemander le subside : {name}", partner: "Renouveler le sponsor : {name}", insurance: "Renouveler : {name}" },
  nl: { affiliation: "Aansluiting {name} {period}", grant: "Subsidie opnieuw aanvragen: {name}", partner: "Sponsor vernieuwen: {name}", insurance: "Vernieuwen: {name}" },
  en: { affiliation: "Affiliation {name} {period}", grant: "Request the grant again: {name}", partner: "Renew the sponsor: {name}", insurance: "Renew: {name}" },
} as const;
