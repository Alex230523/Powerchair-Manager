import type { Locale } from "../lib/locale";
import type { SettingsCategory, SettingsEntryCopy } from "./settings-nav";

/** Texts of the settings home and its sub-pages (wave 15, C13). */
type Copy = {
  title: string;
  hubIntro: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResult: string;
  resultsLabel: string;
  categoriesLabel: string;
  crumbs: string;
  back: string;
  open: string;
  notAvailable: string;
  unsavedTitle: string;
  unsavedText: string;
  leave: string;
  stay: string;
  coachesWithoutRightsOne: string;
  coachesWithoutRights: string;
  language: string;
  languageIntro: string;
  themeTitle: string;
  themeIntro: string;
  privacyTitle: string;
  privacyText: string;
  privacyLink: string;
  categories: Record<SettingsCategory, { title: string; text: string }>;
  entries: SettingsEntryCopy;
};

const fr: Copy = {
  title: "Réglages",
  hubIntro: "Choisissez une catégorie ou cherchez un réglage par son nom.",
  searchLabel: "Rechercher un réglage",
  searchPlaceholder: "Ex. barème, langue, seuils",
  noResult: "Aucun réglage ne correspond à cette recherche.",
  resultsLabel: "Réglages trouvés",
  categoriesLabel: "Catégories de réglages",
  crumbs: "Fil d’Ariane",
  back: "Tous les réglages",
  open: "Ouvrir",
  notAvailable: "Cette catégorie n’est pas disponible pour votre profil.",
  unsavedTitle: "Changements non enregistrés",
  unsavedText: "Vous avez modifié un réglage sans l’enregistrer. Si vous quittez la page, la modification sera perdue.",
  leave: "Quitter sans enregistrer",
  stay: "Rester sur la page",
  coachesWithoutRightsOne: "1 coach sans droits",
  coachesWithoutRights: "{n} coachs sans droits",
  language: "Langue",
  languageIntro: "La langue de l’application et des emails que vous recevez.",
  themeTitle: "Thème",
  themeIntro: "Clair ou sombre, mémorisé sur cet appareil.",
  privacyTitle: "Confidentialité",
  privacyText: "Demandes d’accès, d’export et d’effacement, durées de conservation des données.",
  privacyLink: "Ouvrir la page Confidentialité",
  categories: {
    account: { title: "Mon compte", text: "Photo de profil, langue, thème et rôle de coach." },
    notifications: { title: "Notifications et résumé", text: "Ce que vous recevez, par email ou dans l’application." },
    club: { title: "Club", text: "Nom, logo et contact du club, modules activés." },
    members: { title: "Membres et droits", text: "Ce que chaque coach peut voir et gérer, profils de droits." },
    activities: { title: "Activités", text: "Effectif attendu aux entraînements et aux matchs." },
    money: { title: "Argent", text: "Barèmes de cotisation, alerte de saison lancée, rappels automatiques." },
    journals: { title: "Journaux et confidentialité", text: "Qui a changé quels droits, qui a lu des données de santé." },
  },
  entries: {
    photo: { title: "Photo de profil", keywords: "avatar image portrait" },
    language: { title: "Langue", keywords: "français néerlandais anglais langue emails" },
    theme: { title: "Thème clair ou sombre", keywords: "mode sombre couleurs apparence" },
    selfCoach: { title: "Je suis aussi coach", keywords: "président entraîneur coach" },
    inbox: { title: "Boîte de réception", keywords: "notifications messages non lues" },
    notifPreferences: { title: "Préférences de notification", keywords: "email application recevoir catégories" },
    templates: { title: "Modèles d’emails", keywords: "objet texte modèle email" },
    queue: { title: "File d’envoi des emails", keywords: "envoi pause file erreurs" },
    identity: { title: "Identité du club", keywords: "nom logo email contact fédération" },
    modules: { title: "Modules activés", keywords: "désactiver activer fonctions" },
    coachRights: { title: "Rôles et accès des coachs", keywords: "droits permissions coach équipe suivie" },
    rightProfiles: { title: "Profils de droits", keywords: "trésorier préréglages droits" },
    presence: { title: "Effectif attendu aux séances", keywords: "seuils présence entraînement match suffisant tendu" },
    duesRates: { title: "Barèmes de cotisation", keywords: "montant versements échéances fratrie rappels saison" },
    rightsJournal: { title: "Journal des droits", keywords: "historique audit droits" },
    healthJournal: { title: "Journal des accès aux données de santé", keywords: "santé médical lectures" },
    privacy: { title: "Confidentialité", keywords: "rgpd données effacement export conservation" },
  },
};

const nl: Copy = {
  title: "Instellingen",
  hubIntro: "Kies een categorie of zoek een instelling op naam.",
  searchLabel: "Een instelling zoeken",
  searchPlaceholder: "Bv. tarief, taal, drempels",
  noResult: "Geen instelling komt overeen met deze zoekopdracht.",
  resultsLabel: "Gevonden instellingen",
  categoriesLabel: "Categorieën van instellingen",
  crumbs: "Kruimelpad",
  back: "Alle instellingen",
  open: "Openen",
  notAvailable: "Deze categorie is niet beschikbaar voor je profiel.",
  unsavedTitle: "Niet-opgeslagen wijzigingen",
  unsavedText: "Je hebt een instelling gewijzigd zonder op te slaan. Als je de pagina verlaat, gaat de wijziging verloren.",
  leave: "Verlaten zonder opslaan",
  stay: "Op de pagina blijven",
  coachesWithoutRightsOne: "1 coach zonder rechten",
  coachesWithoutRights: "{n} coaches zonder rechten",
  language: "Taal",
  languageIntro: "De taal van de applicatie en van de e-mails die je ontvangt.",
  themeTitle: "Thema",
  themeIntro: "Licht of donker, onthouden op dit toestel.",
  privacyTitle: "Privacy",
  privacyText: "Verzoeken tot inzage, export en wissing, bewaartermijnen van gegevens.",
  privacyLink: "De privacypagina openen",
  categories: {
    account: { title: "Mijn account", text: "Profielfoto, taal, thema en coachrol." },
    notifications: { title: "Meldingen en overzicht", text: "Wat je ontvangt, per e-mail of in de applicatie." },
    club: { title: "Club", text: "Naam, logo en contact van de club, actieve modules." },
    members: { title: "Leden en rechten", text: "Wat elke coach mag zien en beheren, rechtenprofielen." },
    activities: { title: "Activiteiten", text: "Verwachte bezetting op trainingen en wedstrijden." },
    money: { title: "Geld", text: "Lidgeldtarieven, waarschuwing bij gestart seizoen, automatische herinneringen." },
    journals: { title: "Logboeken en privacy", text: "Wie welke rechten wijzigde, wie gezondheidsgegevens las." },
  },
  entries: {
    photo: { title: "Profielfoto", keywords: "avatar foto portret" },
    language: { title: "Taal", keywords: "frans nederlands engels taal e-mails" },
    theme: { title: "Licht of donker thema", keywords: "donkere modus kleuren weergave" },
    selfCoach: { title: "Ik ben ook coach", keywords: "voorzitter trainer coach" },
    inbox: { title: "Inbox", keywords: "meldingen berichten ongelezen" },
    notifPreferences: { title: "Meldingsvoorkeuren", keywords: "e-mail applicatie ontvangen categorieën" },
    templates: { title: "E-mailsjablonen", keywords: "onderwerp tekst sjabloon e-mail" },
    queue: { title: "Wachtrij van e-mails", keywords: "verzending pauze wachtrij fouten" },
    identity: { title: "Identiteit van de club", keywords: "naam logo e-mail contact federatie" },
    modules: { title: "Actieve modules", keywords: "uitschakelen inschakelen functies" },
    coachRights: { title: "Rollen en toegang van coaches", keywords: "rechten machtigingen coach gevolgd team" },
    rightProfiles: { title: "Rechtenprofielen", keywords: "penningmeester voorinstellingen rechten" },
    presence: { title: "Verwachte bezetting", keywords: "drempels aanwezigheid training wedstrijd voldoende krap" },
    duesRates: { title: "Lidgeldtarieven", keywords: "bedrag stortingen vervaldagen broers zussen herinneringen seizoen" },
    rightsJournal: { title: "Logboek van de rechten", keywords: "geschiedenis audit rechten" },
    healthJournal: { title: "Logboek van toegang tot gezondheidsgegevens", keywords: "gezondheid medisch inzage" },
    privacy: { title: "Privacy", keywords: "avg gegevens wissing export bewaring" },
  },
};

const en: Copy = {
  title: "Settings",
  hubIntro: "Pick a category or search for a setting by name.",
  searchLabel: "Search a setting",
  searchPlaceholder: "E.g. rate, language, thresholds",
  noResult: "No setting matches this search.",
  resultsLabel: "Settings found",
  categoriesLabel: "Settings categories",
  crumbs: "Breadcrumb",
  back: "All settings",
  open: "Open",
  notAvailable: "This category is not available for your profile.",
  unsavedTitle: "Unsaved changes",
  unsavedText: "You changed a setting without saving it. If you leave the page, the change will be lost.",
  leave: "Leave without saving",
  stay: "Stay on the page",
  coachesWithoutRightsOne: "1 coach without rights",
  coachesWithoutRights: "{n} coaches without rights",
  language: "Language",
  languageIntro: "The language of the application and of the emails you receive.",
  themeTitle: "Theme",
  themeIntro: "Light or dark, remembered on this device.",
  privacyTitle: "Privacy",
  privacyText: "Access, export and erasure requests, data retention periods.",
  privacyLink: "Open the Privacy page",
  categories: {
    account: { title: "My account", text: "Profile photo, language, theme and coach role." },
    notifications: { title: "Notifications and digest", text: "What you receive, by email or in the application." },
    club: { title: "Club", text: "Club name, logo and contact, enabled modules." },
    members: { title: "Members and rights", text: "What each coach may see and manage, rights profiles." },
    activities: { title: "Activities", text: "Expected attendance at trainings and matches." },
    money: { title: "Money", text: "Membership rates, season-started warning, automatic reminders." },
    journals: { title: "Logs and privacy", text: "Who changed which rights, who read health data." },
  },
  entries: {
    photo: { title: "Profile photo", keywords: "avatar picture portrait" },
    language: { title: "Language", keywords: "french dutch english language emails" },
    theme: { title: "Light or dark theme", keywords: "dark mode colours appearance" },
    selfCoach: { title: "I also coach", keywords: "president trainer coach" },
    inbox: { title: "Inbox", keywords: "notifications messages unread" },
    notifPreferences: { title: "Notification preferences", keywords: "email application receive categories" },
    templates: { title: "Email templates", keywords: "subject text template email" },
    queue: { title: "Email queue", keywords: "sending pause queue errors" },
    identity: { title: "Club identity", keywords: "name logo email contact federation" },
    modules: { title: "Enabled modules", keywords: "disable enable features" },
    coachRights: { title: "Coach roles and access", keywords: "rights permissions coach team followed" },
    rightProfiles: { title: "Rights profiles", keywords: "treasurer presets rights" },
    presence: { title: "Expected attendance", keywords: "thresholds presence training match enough tight" },
    duesRates: { title: "Membership rates", keywords: "amount instalments due dates siblings reminders season" },
    rightsJournal: { title: "Rights log", keywords: "history audit rights" },
    healthJournal: { title: "Health data access log", keywords: "health medical reads" },
    privacy: { title: "Privacy", keywords: "gdpr data erasure export retention" },
  },
};

export const settingsHubCopy: Record<Locale, Copy> = { fr, nl, en };
