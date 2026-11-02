/**
 * G10, Mode d'emploi: one short sheet per key action and role, with a
 * capture of the screen taken by Playwright on the demo club (npm run
 * audit:help). The sheets describe the application itself, so they live
 * here rather than with the federation's chapters. The « Aide » link at the
 * top of a page opens the sheet of that page for the reader's role.
 */
type T3 = { fr: string; nl: string; en: string };
export type HelpRole = "president" | "coach" | "player" | "parent" | "federation" | "referee";
export type HelpSheet = { id: string; roles: HelpRole[]; route: string; title: T3; steps: T3[] };

export const helpSheets: HelpSheet[] = [
  {
    id: "answer-invitation",
    roles: ["player", "parent"],
    route: "/family",
    title: { fr: "Répondre à une invitation", nl: "Op een uitnodiging antwoorden", en: "Answer an invitation" },
    steps: [
      { fr: "Ouvrez Famille (ou l'accueil) : les invitations à venir sont en tête.", nl: "Open Gezin (of het onthaal): de komende uitnodigingen staan bovenaan.", en: "Open Family (or the home page): the coming invitations are at the top." },
      { fr: "Choisissez Présent, Absent ou Incertain pour chaque séance ou match.", nl: "Kies Aanwezig, Afwezig of Onzeker voor elke sessie of wedstrijd.", en: "Choose Present, Absent or Uncertain for each session or match." },
      { fr: "Pour plusieurs dates d'un coup, cochez-les puis répondez une seule fois.", nl: "Voor meerdere datums tegelijk: vink ze aan en antwoord één keer.", en: "For several dates at once, tick them then answer once." },
    ],
  },
  {
    id: "pay-qr",
    roles: ["parent", "player"],
    route: "/dues",
    title: { fr: "Payer par QR code", nl: "Betalen met QR-code", en: "Pay by QR code" },
    steps: [
      { fr: "Ouvrez Cotisations : chaque échéance montre son montant et sa date.", nl: "Open Lidgelden: elke vervaldag toont bedrag en datum.", en: "Open Dues: each instalment shows its amount and date." },
      { fr: "Touchez « Payer » : un QR code s'affiche avec la communication structurée.", nl: "Tik op « Betalen »: een QR-code verschijnt met de gestructureerde mededeling.", en: "Tap « Pay »: a QR code appears with the structured reference." },
      { fr: "Scannez-le avec l'application de votre banque et validez.", nl: "Scan hem met de app van uw bank en bevestig.", en: "Scan it with your bank's app and confirm." },
    ],
  },
  {
    id: "upload-document",
    roles: ["parent", "player", "coach"],
    route: "/documents",
    title: { fr: "Déposer un document", nl: "Een document opladen", en: "Upload a document" },
    steps: [
      { fr: "Ouvrez Documents : ce qui est demandé est marqué « À fournir ».", nl: "Open Documenten: wat gevraagd wordt, staat als « Te bezorgen ».", en: "Open Documents: what is asked is marked « To provide »." },
      { fr: "Touchez « Déposer », choisissez la photo ou le PDF.", nl: "Tik op « Opladen », kies de foto of de pdf.", en: "Tap « Upload », choose the photo or the PDF." },
      { fr: "Le club valide ; vous êtes prévenu s'il manque quelque chose.", nl: "De club keurt goed; u wordt verwittigd als er iets ontbreekt.", en: "The club approves; you are told if something is missing." },
    ],
  },
  {
    id: "report-breakdown",
    roles: ["coach", "president", "parent"],
    route: "/equipment",
    title: { fr: "Signaler une panne", nl: "Een defect melden", en: "Report a breakdown" },
    steps: [
      { fr: "Ouvrez Matériel, puis la fiche du fauteuil.", nl: "Open Materiaal en daarna de fiche van de rolstoel.", en: "Open Equipment, then the chair's file." },
      { fr: "Touchez « Signaler une panne », décrivez ce qui ne va pas.", nl: "Tik op « Defect melden », beschrijf wat er mis is.", en: "Tap « Report a breakdown », describe what is wrong." },
      { fr: "Le responsable du matériel est prévenu ; le fauteuil passe « En panne » si besoin.", nl: "De materiaalverantwoordelijke wordt verwittigd; de rolstoel gaat zo nodig op « Defect ».", en: "The equipment manager is told; the chair goes « Out of order » if needed." },
    ],
  },
  {
    id: "take-attendance",
    roles: ["coach", "president"],
    route: "/attendance",
    title: { fr: "Faire l'appel", nl: "Aanwezigheden opnemen", en: "Take attendance" },
    steps: [
      { fr: "Ouvrez Présences et choisissez la séance du jour.", nl: "Open Aanwezigheden en kies de sessie van vandaag.", en: "Open Attendance and choose today's session." },
      { fr: "Touchez chaque joueur présent ; les réponses données d'avance sont déjà là.", nl: "Tik elke aanwezige speler aan; de vooraf gegeven antwoorden staan er al.", en: "Tap each player present; the answers given beforehand are already there." },
      { fr: "Clôturez le registre à la fin de la séance.", nl: "Sluit het register aan het einde van de sessie.", en: "Close the register at the end of the session." },
    ],
  },
  {
    id: "issue-dues",
    roles: ["president"],
    route: "/dues",
    title: { fr: "Émettre les cotisations", nl: "Lidgelden uitschrijven", en: "Issue the dues" },
    steps: [
      { fr: "Vérifiez les barèmes dans Réglages › Finances (montants, échéances, fratries).", nl: "Controleer de tarieven in Instellingen › Financiën (bedragen, vervaldagen, broers en zussen).", en: "Check the rates in Settings › Money (amounts, due dates, siblings)." },
      { fr: "Ouvrez Cotisations et touchez « Émettre » pour la saison.", nl: "Open Lidgelden en tik op « Uitschrijven » voor het seizoen.", en: "Open Dues and tap « Issue » for the season." },
      { fr: "Les familles reçoivent leur échéancier avec le QR code ; les relances suivent seules.", nl: "De gezinnen krijgen hun vervaldagen met QR-code; de herinneringen volgen vanzelf.", en: "Families receive their schedule with the QR code; reminders follow by themselves." },
    ],
  },
  {
    id: "appoint-referee",
    roles: ["federation"],
    route: "/federation/referees",
    title: { fr: "Désigner un arbitre", nl: "Een scheidsrechter aanduiden", en: "Appoint a referee" },
    steps: [
      { fr: "Ouvrez Arbitres : les matchs sans arbitre sont en tête.", nl: "Open Scheidsrechters: wedstrijden zonder scheidsrechter staan bovenaan.", en: "Open Referees: matches without a referee come first." },
      { fr: "Choisissez un arbitre ; ses disponibilités sont affichées.", nl: "Kies een scheidsrechter; zijn beschikbaarheden worden getoond.", en: "Choose a referee; his availability is shown." },
      { fr: "L'arbitre est prévenu et voit le match dans son espace.", nl: "De scheidsrechter wordt verwittigd en ziet de wedstrijd in zijn ruimte.", en: "The referee is told and sees the match in his space." },
    ],
  },
];

/** The sheet of a page for a role (the « Aide » link), or none. */
export function helpFor(path: string, role: HelpRole | null) {
  const route = path.replace(/^\/(fr|nl|en)(?=\/|$)/, "") || "/";
  return helpSheets.find((s) => (!role || s.roles.includes(role)) && (route === s.route || route.startsWith(s.route + "/"))) ?? null;
}

/** The role a mandate reads the sheets as. */
export function helpRole(role: string | null | undefined): HelpRole | null {
  const map: Record<string, HelpRole> = { club_president: "president", coach: "coach", player: "player", guardian: "parent", federation_president: "federation", federation_worker: "federation", referee: "referee" };
  return role ? (map[role] ?? null) : null;
}

/**
 * The audit's report on the captures: a sheet whose capture is missing, or
 * whose screen changed beyond the tolerance, is flagged for review.
 */
export function staleCaptures(results: { id: string; status: "same" | "changed" | "missing" }[]) {
  return results.filter((r) => r.status !== "same").map((r) => ({ id: r.id, reason: r.status }));
}
