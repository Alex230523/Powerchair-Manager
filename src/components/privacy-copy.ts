import type { Locale } from "../lib/locale";

const fr = {
  title: "Données personnelles",
  intro:
    "Doublons, droit d'accès, anonymisation et durées de conservation (RGPD). Réservé aux responsables du répertoire, avec la double authentification.",
  loading: "Chargement…",
  unavailable: "Page indisponible pour le moment.",
  restricted:
    "Ces outils sont réservés aux personnes qui gèrent le répertoire du club, avec la double authentification.",
  duplicates: "Fiches en double",
  duplicatesIntro:
    "Fiches qui semblent décrire la même personne (même nom avec une date de naissance compatible, ou même e-mail). La fusion déplace équipes, familles, documents, présences, cotisations, fauteuils, formations et inscriptions sur la fiche gardée.",
  noDuplicate: "Aucun doublon probable.",
  sameName: "même nom",
  sameEmail: "même e-mail",
  keep: "Garder",
  account: "compte lié",
  born: "née le",
  merge: "Fusionner dans « {name} »",
  confirmMerge: "Confirmer la fusion (irréversible)",
  merged: "Fiches fusionnées.",
  access: "Droit d'accès",
  accessIntro:
    "Télécharge en un fichier tout ce que le club conserve sur une personne, à lui transmettre sur demande.",
  person: "Personne",
  choose: "Choisir une personne",
  export: "Télécharger ses données (JSON)",
  anonymize: "Anonymisation",
  anonymizeIntro:
    "Efface nom, date de naissance, coordonnées, notes de santé, fichiers et réponses d'inscription. Les statistiques restent, sans nom. Une personne qui a encore un compte doit d'abord quitter le club.",
  confirmLabel: "Retapez le nom complet pour confirmer",
  anonymizeButton: "Anonymiser définitivement",
  anonymized: "Fiche anonymisée.",
  retention: "Conservation",
  retentionIntro:
    "Durées après lesquelles le club anonymise les données qui ne sont plus utiles.",
  formerYears: "Anciens membres : anonymiser après (années)",
  refusedMonths: "Candidatures refusées ou retirées : anonymiser après (mois)",
  save: "Enregistrer",
  saved: "Règles enregistrées.",
  toReview: "À traiter selon ces règles",
  formerList: "Anciens membres sans activité depuis plus de {n} ans",
  noFormer: "Aucun ancien membre à anonymiser.",
  applications: "{n} candidatures refusées ou retirées à anonymiser",
  purge: "Anonymiser ces candidatures",
  purged: "{n} candidatures anonymisées.",
  history: "Dernières actions",
  actions: {
    export: "Export de données",
    anonymize: "Anonymisation",
    merge: "Fusion de fiches",
    purge_applications: "Candidatures anonymisées",
  } as Record<string, string>,
  errors: {
    TWO_ACCOUNTS:
      "Les deux fiches ont un compte : impossible de les fusionner.",
    DIFFERENT_BIRTH_DATES:
      "Les dates de naissance diffèrent : ce ne sont pas les mêmes personnes.",
    TRANSFER_PENDING: "Un transfert est en cours pour cette fiche.",
    DUES_CONFLICT:
      "Les deux fiches ont une cotisation ouverte de même catégorie cette saison : annulez-en une d'abord.",
    CONFIRMATION_MISMATCH: "Le nom retapé ne correspond pas.",
    HAS_ACCOUNT: "Cette personne a encore un compte actif dans le club.",
  } as Record<string, string>,
};
type Copy = typeof fr;
const nl: Copy = {
  title: "Persoonsgegevens",
  intro:
    "Dubbels, inzagerecht, anonimisering en bewaartermijnen (AVG). Voorbehouden aan de beheerders van het personenregister, met tweestapsverificatie.",
  loading: "Laden…",
  unavailable: "Pagina momenteel niet beschikbaar.",
  restricted:
    "Deze hulpmiddelen zijn voorbehouden aan wie het personenregister beheert, met tweestapsverificatie.",
  duplicates: "Dubbele fiches",
  duplicatesIntro:
    "Fiches die dezelfde persoon lijken te beschrijven (zelfde naam met verenigbare geboortedatum, of zelfde e-mail). Samenvoegen verplaatst teams, families, documenten, aanwezigheden, lidgelden, rolstoelen, opleidingen en inschrijvingen naar de behouden fiche.",
  noDuplicate: "Geen waarschijnlijke dubbels.",
  sameName: "zelfde naam",
  sameEmail: "zelfde e-mail",
  keep: "Behouden",
  account: "gekoppeld account",
  born: "geboren op",
  merge: "Samenvoegen in « {name} »",
  confirmMerge: "Samenvoegen bevestigen (onomkeerbaar)",
  merged: "Fiches samengevoegd.",
  access: "Inzagerecht",
  accessIntro:
    "Downloadt in één bestand alles wat de club over een persoon bewaart, om op verzoek te bezorgen.",
  person: "Persoon",
  choose: "Kies een persoon",
  export: "Gegevens downloaden (JSON)",
  anonymize: "Anonimisering",
  anonymizeIntro:
    "Wist naam, geboortedatum, contactgegevens, gezondheidsnotities, bestanden en inschrijvingsantwoorden. De statistieken blijven, zonder naam. Iemand met een account moet eerst de club verlaten.",
  confirmLabel: "Typ de volledige naam opnieuw om te bevestigen",
  anonymizeButton: "Definitief anonimiseren",
  anonymized: "Fiche geanonimiseerd.",
  retention: "Bewaring",
  retentionIntro:
    "Termijnen waarna de club gegevens die niet meer nodig zijn anonimiseert.",
  formerYears: "Oud-leden: anonimiseren na (jaren)",
  refusedMonths:
    "Geweigerde of ingetrokken aanvragen: anonimiseren na (maanden)",
  save: "Opslaan",
  saved: "Regels opgeslagen.",
  toReview: "Te behandelen volgens deze regels",
  formerList: "Oud-leden zonder activiteit sinds meer dan {n} jaar",
  noFormer: "Geen oud-leden om te anonimiseren.",
  applications: "{n} geweigerde of ingetrokken aanvragen om te anonimiseren",
  purge: "Deze aanvragen anonimiseren",
  purged: "{n} aanvragen geanonimiseerd.",
  history: "Laatste acties",
  actions: {
    export: "Gegevensexport",
    anonymize: "Anonimisering",
    merge: "Samenvoeging",
    purge_applications: "Aanvragen geanonimiseerd",
  },
  errors: {
    TWO_ACCOUNTS:
      "Beide fiches hebben een account: samenvoegen is niet mogelijk.",
    DIFFERENT_BIRTH_DATES:
      "De geboortedata verschillen: het zijn niet dezelfde personen.",
    TRANSFER_PENDING: "Er loopt een transfer voor deze fiche.",
    DUES_CONFLICT:
      "Beide fiches hebben dit seizoen een open lidgeld van dezelfde categorie: annuleer er eerst één.",
    CONFIRMATION_MISMATCH: "De opnieuw getypte naam komt niet overeen.",
    HAS_ACCOUNT: "Deze persoon heeft nog een actief account in de club.",
  },
};
const en: Copy = {
  title: "Personal data",
  intro:
    "Duplicates, right of access, anonymisation and retention periods (GDPR). Reserved to directory managers, with two-factor authentication.",
  loading: "Loading…",
  unavailable: "Page unavailable right now.",
  restricted:
    "These tools are reserved to people who manage the club directory, with two-factor authentication.",
  duplicates: "Duplicate profiles",
  duplicatesIntro:
    "Profiles that seem to describe the same person (same name with a compatible birth date, or same email). Merging moves teams, families, documents, attendance, dues, chairs, courses and registrations onto the kept profile.",
  noDuplicate: "No likely duplicate.",
  sameName: "same name",
  sameEmail: "same email",
  keep: "Keep",
  account: "linked account",
  born: "born",
  merge: "Merge into « {name} »",
  confirmMerge: "Confirm the merge (irreversible)",
  merged: "Profiles merged.",
  access: "Right of access",
  accessIntro:
    "Downloads in one file everything the club holds about a person, to send them on request.",
  person: "Person",
  choose: "Choose a person",
  export: "Download their data (JSON)",
  anonymize: "Anonymisation",
  anonymizeIntro:
    "Erases name, birth date, contact details, health notes, files and registration answers. Statistics stay, without a name. Someone who still has an account must leave the club first.",
  confirmLabel: "Type the full name again to confirm",
  anonymizeButton: "Anonymise permanently",
  anonymized: "Profile anonymised.",
  retention: "Retention",
  retentionIntro:
    "Periods after which the club anonymises data it no longer needs.",
  formerYears: "Former members: anonymise after (years)",
  refusedMonths: "Refused or withdrawn applications: anonymise after (months)",
  save: "Save",
  saved: "Rules saved.",
  toReview: "To handle under these rules",
  formerList: "Former members inactive for more than {n} years",
  noFormer: "No former member to anonymise.",
  applications: "{n} refused or withdrawn applications to anonymise",
  purge: "Anonymise these applications",
  purged: "{n} applications anonymised.",
  history: "Latest actions",
  actions: {
    export: "Data export",
    anonymize: "Anonymisation",
    merge: "Profiles merged",
    purge_applications: "Applications anonymised",
  },
  errors: {
    TWO_ACCOUNTS: "Both profiles have an account: they cannot be merged.",
    DIFFERENT_BIRTH_DATES:
      "The birth dates differ: these are not the same people.",
    TRANSFER_PENDING: "A transfer is pending for this profile.",
    DUES_CONFLICT:
      "Both profiles have open dues of the same category this season: cancel one first.",
    CONFIRMATION_MISMATCH: "The typed name does not match.",
    HAS_ACCOUNT: "This person still has an active account in the club.",
  },
};
export const privacyCopy: Record<Locale, Copy> = { fr, nl, en };
