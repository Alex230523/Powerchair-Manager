import type { Category, OwnKind } from "./schema";

/**
 * 12/11/2026: ready-made task lists every club starts from (« pré-modèles »),
 * beside the suggested templates of the settings (transport, training,
 * tournament, season, recruit, grant, dinner).
 * Each line is due so many days before the date chosen (the match, the
 * tournament, the assembly). A club applies one as it is, or copies it into
 * its own templates to change it.
 */
type L = { fr: string; nl: string; en: string };
export type Preset = { key: string; kind: OwnKind; category: Category; name: L; items: { title: L; daysBefore: number }[] };

const i = (daysBefore: number, fr: string, nl: string, en: string) => ({ daysBefore, title: { fr, nl, en } });

export const presets: Preset[] = [
  {
    key: "matchHome",
    kind: "training",
    category: "sport",
    name: { fr: "Match à domicile", nl: "Thuiswedstrijd", en: "Home match" },
    items: [
      i(21, "Réserver la salle", "De zaal reserveren", "Book the hall"),
      i(14, "Confirmer les arbitres", "De scheidsrechters bevestigen", "Confirm the referees"),
      i(7, "Prévenir les joueurs et les parents", "Spelers en ouders verwittigen", "Tell the players and the parents"),
      i(2, "Préparer la buvette", "De cafetaria voorbereiden", "Prepare the refreshment stand"),
      i(1, "Charger les fauteuils et les batteries", "De rolstoelen en batterijen opladen", "Charge the chairs and the batteries"),
      i(1, "Imprimer la feuille de match", "Het wedstrijdblad afdrukken", "Print the match sheet"),
    ],
  },
  {
    key: "matchAway",
    kind: "transport",
    category: "events",
    name: { fr: "Match à l'extérieur", nl: "Uitwedstrijd", en: "Away match" },
    items: [
      i(14, "Réserver le véhicule adapté", "Het aangepaste voertuig reserveren", "Book the adapted vehicle"),
      i(10, "Trouver les chauffeurs", "Chauffeurs zoeken", "Find the drivers"),
      i(3, "Communiquer l'heure et le lieu de départ", "Vertrekuur en -plaats meedelen", "Share the departure time and place"),
      i(1, "Charger les fauteuils et les batteries", "De rolstoelen en batterijen opladen", "Charge the chairs and the batteries"),
      i(0, "Prendre la trousse de secours", "De EHBO-koffer meenemen", "Take the first aid kit"),
    ],
  },
  {
    key: "assembly",
    kind: "documents",
    category: "admin",
    name: { fr: "Assemblée générale", nl: "Algemene vergadering", en: "General assembly" },
    items: [
      i(35, "Arrêter les comptes de l'année", "De jaarrekening afsluiten", "Close the year's accounts"),
      i(28, "Préparer l'ordre du jour", "De agenda voorbereiden", "Prepare the agenda"),
      i(21, "Envoyer l'invitation aux membres", "De uitnodiging naar de leden sturen", "Send the invitation to the members"),
      i(1, "Imprimer la liste de présence", "De aanwezigheidslijst afdrukken", "Print the attendance list"),
      i(0, "Rédiger le procès-verbal", "De notulen opstellen", "Write the minutes"),
    ],
  },
  {
    key: "openDay",
    kind: "other",
    category: "events",
    name: { fr: "Journée découverte", nl: "Kennismakingsdag", en: "Discovery day" },
    items: [
      i(45, "Réserver la salle", "De zaal reserveren", "Book the hall"),
      i(30, "Annoncer la journée", "De dag aankondigen", "Announce the day"),
      i(21, "Prévenir les centres de revalidation", "De revalidatiecentra verwittigen", "Tell the rehabilitation centres"),
      i(7, "Préparer les fauteuils d'essai", "De testrolstoelen klaarmaken", "Prepare the trial chairs"),
      i(1, "Organiser l'accueil", "Het onthaal regelen", "Arrange the welcome"),
    ],
  },
  {
    key: "fundraising",
    kind: "other",
    category: "fundraising",
    name: { fr: "Récolte de fonds", nl: "Fondsenwerving", en: "Fundraising" },
    items: [
      i(30, "Fixer l'objectif et le projet", "Het doel en het project vastleggen", "Set the goal and the project"),
      i(21, "Ouvrir la cagnotte", "De pot openen", "Open the pot"),
      i(14, "Partager l'appel aux dons", "De oproep tot giften delen", "Share the call for donations"),
      i(0, "Remercier les donateurs", "De schenkers bedanken", "Thank the donors"),
    ],
  },
];
export const presetKeys = presets.map((p) => p.key) as [string, ...string[]];
export const presetOf = (key: string) => presets.find((p) => p.key === key);
