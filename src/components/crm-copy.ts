import type { InteractionKind, LegalBasis, OrganizationKind } from "@/domains/crm/schema";

/** A4: the contact book as a light CRM. */
type Copy = {
  tabs: string;
  tabContacts: string;
  tabOrganizations: string;
  tabDuplicates: string;
  open: string;
  openOf: string;
  lastContact: string;
  never: string;
  organization: string;
  organizationHint: string;
  kinds: Record<OrganizationKind, string>;
  kind: string;
  website: string;
  address: string;
  newOrganization: string;
  editOrganization: string;
  deleteOrganization: string;
  deleteOrganizationOf: string;
  organizationsEmpty: string;
  contactsCount: string;
  log: string;
  logLabel: string;
  logHint: string;
  interactionKinds: Record<InteractionKind, string>;
  logAs: string;
  logEmpty: string;
  removeLine: string;
  automatic: string;
  sources: Record<string, string>;
  linked: string;
  linkedEmpty: string;
  linkedKinds: Record<"grants" | "partners" | "funders" | "donations" | "chairs" | "venues" | "events" | "tasks", string>;
  donationsTotal: string;
  nextAction: string;
  nextActionTitle: string;
  nextActionDue: string;
  nextActionWho: string;
  nextActionAdd: string;
  nextActionAdded: string;
  nobody: string;
  gdpr: string;
  legalBasis: string;
  legalBases: Record<LegalBasis, string>;
  contactOk: string;
  contactNo: string;
  consentOn: string;
  exportData: string;
  erase: string;
  eraseConfirm: string;
  erased: string;
  duplicatesIntro: string;
  duplicatesNone: string;
  reasons: Record<"email" | "phone" | "name", string>;
  keep: string;
  keepOf: string;
  mergeConfirm: string;
  merged: string;
  importTitle: string;
  importIntro: string;
  importFile: string;
  importPreview: string;
  importIgnored: string;
  importTags: string;
  importRun: string;
  importDone: string;
  importNone: string;
  importOpen: string;
  pickerCreate: string;
  pickerCreateTitle: string;
  pickerName: string;
  pickerCompany: string;
  pickerEmail: string;
  pickerPhone: string;
  pickerAdd: string;
  pickerCancel: string;
  pickerCreated: string;
  pickerLoading: string;
  supplier: string;
  donor: string;
};

export const crmCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    tabs: "Vues du carnet",
    tabContacts: "Contacts",
    tabOrganizations: "Organisations",
    tabDuplicates: "Doublons",
    open: "Ouvrir la fiche",
    openOf: "Ouvrir la fiche de {name}",
    lastContact: "Dernier contact",
    never: "Jamais",
    organization: "Organisation",
    organizationHint: "Choisissez dans la liste ou tapez un nouveau nom : l'organisation est créée.",
    kinds: { company: "Entreprise", public: "Pouvoir public", foundation: "Fondation", federation: "Fédération", supplier: "Fournisseur", venue: "Salle", media: "Média", other: "Autre" },
    kind: "Type",
    website: "Site web",
    address: "Adresse",
    newOrganization: "Nouvelle organisation",
    editOrganization: "Modifier l'organisation",
    deleteOrganization: "Supprimer",
    deleteOrganizationOf: "Supprimer l'organisation {name} (ses contacts restent)",
    organizationsEmpty: "Aucune organisation pour l'instant.",
    contactsCount: "{n} contact(s)",
    log: "Journal d'échanges",
    logLabel: "Ce qui s'est dit, en une ligne",
    logHint: "Tapez une ligne puis choisissez : appel, email, rencontre ou note.",
    interactionKinds: { call: "Appel", email: "Email", meeting: "Rencontre", note: "Note", sent: "Envoyé par l'application" },
    logAs: "Enregistrer comme {kind}",
    logEmpty: "Aucun échange noté.",
    removeLine: "Supprimer la ligne du {date}",
    automatic: "automatique",
    sources: { partner_report: "Rapport partenaire partagé", merge: "Fiche fusionnée" },
    linked: "Relié à",
    linkedEmpty: "Ce contact n'est relié à rien pour l'instant.",
    linkedKinds: { grants: "Subsides", partners: "Sponsors", funders: "Organismes de subsides", donations: "Dons", chairs: "Fauteuils (fournisseur)", venues: "Salles", events: "Événements", tasks: "Tâches" },
    donationsTotal: "{year} : {total}",
    nextAction: "Prochaine action",
    nextActionTitle: "Quoi",
    nextActionDue: "Pour le",
    nextActionWho: "Qui",
    nextActionAdd: "Ajouter à la to-do",
    nextActionAdded: "Ajouté à la to-do.",
    nobody: "Personne",
    gdpr: "Vie privée",
    legalBasis: "Base légale",
    legalBases: { legitimate_interest: "Intérêt légitime", consent: "Consentement", contract: "Contrat", legal_obligation: "Obligation légale" },
    contactOk: "Accepte d'être contacté",
    contactNo: "Ne souhaite pas être contacté",
    consentOn: "Consentement donné le",
    exportData: "Exporter ses données",
    erase: "Effacer ce contact",
    eraseConfirm: "Effacer définitivement ce contact et son journal ? Les dossiers liés gardent leur texte.",
    erased: "Contact effacé.",
    duplicatesIntro: "Ces fiches semblent désigner la même personne. Choisissez celle à garder : l'autre y est fusionnée, avec son historique.",
    duplicatesNone: "Aucun doublon repéré.",
    reasons: { email: "Même email", phone: "Même téléphone", name: "Nom très proche" },
    keep: "Garder {name}",
    keepOf: "Garder {name} et y fusionner {other}",
    mergeConfirm: "Fusionner {other} dans {name} ? Cette action est définitive.",
    merged: "Fiches fusionnées.",
    importTitle: "Importer des contacts",
    importIntro: "Un fichier CSV (tableur, messagerie) ou vCard (téléphone). Les emails déjà connus sont ignorés.",
    importFile: "Fichier",
    importPreview: "{n} contact(s) prêt(s) à importer",
    importIgnored: "{n} ligne(s) sans nom ignorée(s)",
    importTags: "Étiquettes à donner",
    importRun: "Importer",
    importDone: "{created} contact(s) importé(s), {skipped} déjà connu(s).",
    importNone: "Aucun contact lisible dans ce fichier.",
    importOpen: "Importer",
    pickerCreate: "Créer un contact",
    pickerCreateTitle: "Nouveau contact",
    pickerName: "Nom",
    pickerCompany: "Organisation",
    pickerEmail: "Email",
    pickerPhone: "Téléphone",
    pickerAdd: "Créer et choisir",
    pickerCancel: "Annuler",
    pickerCreated: "Contact créé et choisi.",
    pickerLoading: "Chargement des contacts…",
    supplier: "Fournisseur",
    donor: "Donateur (carnet de contacts)",
  },
  nl: {
    tabs: "Weergaven van het adresboek",
    tabContacts: "Contacten",
    tabOrganizations: "Organisaties",
    tabDuplicates: "Dubbels",
    open: "De fiche openen",
    openOf: "De fiche van {name} openen",
    lastContact: "Laatste contact",
    never: "Nooit",
    organization: "Organisatie",
    organizationHint: "Kies in de lijst of typ een nieuwe naam: de organisatie wordt aangemaakt.",
    kinds: { company: "Bedrijf", public: "Overheid", foundation: "Stichting", federation: "Federatie", supplier: "Leverancier", venue: "Zaal", media: "Media", other: "Andere" },
    kind: "Soort",
    website: "Website",
    address: "Adres",
    newOrganization: "Nieuwe organisatie",
    editOrganization: "De organisatie wijzigen",
    deleteOrganization: "Verwijderen",
    deleteOrganizationOf: "De organisatie {name} verwijderen (de contacten blijven)",
    organizationsEmpty: "Nog geen organisatie.",
    contactsCount: "{n} contact(en)",
    log: "Logboek van contacten",
    logLabel: "Wat er gezegd werd, in één regel",
    logHint: "Typ een regel en kies: oproep, e-mail, ontmoeting of notitie.",
    interactionKinds: { call: "Oproep", email: "E-mail", meeting: "Ontmoeting", note: "Notitie", sent: "Verstuurd door de toepassing" },
    logAs: "Opslaan als {kind}",
    logEmpty: "Nog geen contact genoteerd.",
    removeLine: "De regel van {date} verwijderen",
    automatic: "automatisch",
    sources: { partner_report: "Partnerverslag gedeeld", merge: "Fiche samengevoegd" },
    linked: "Gekoppeld aan",
    linkedEmpty: "Dit contact is nog nergens aan gekoppeld.",
    linkedKinds: { grants: "Subsidies", partners: "Sponsors", funders: "Subsidieverstrekkers", donations: "Giften", chairs: "Rolstoelen (leverancier)", venues: "Zalen", events: "Activiteiten", tasks: "Taken" },
    donationsTotal: "{year}: {total}",
    nextAction: "Volgende stap",
    nextActionTitle: "Wat",
    nextActionDue: "Tegen",
    nextActionWho: "Wie",
    nextActionAdd: "Aan de takenlijst toevoegen",
    nextActionAdded: "Aan de takenlijst toegevoegd.",
    nobody: "Niemand",
    gdpr: "Privacy",
    legalBasis: "Rechtsgrond",
    legalBases: { legitimate_interest: "Gerechtvaardigd belang", consent: "Toestemming", contract: "Overeenkomst", legal_obligation: "Wettelijke verplichting" },
    contactOk: "Gaat akkoord om gecontacteerd te worden",
    contactNo: "Wil niet gecontacteerd worden",
    consentOn: "Toestemming gegeven op",
    exportData: "Zijn gegevens exporteren",
    erase: "Dit contact wissen",
    eraseConfirm: "Dit contact en zijn logboek definitief wissen? De gekoppelde dossiers behouden hun tekst.",
    erased: "Contact gewist.",
    duplicatesIntro: "Deze fiches lijken dezelfde persoon. Kies welke u houdt: de andere wordt erin samengevoegd, met haar geschiedenis.",
    duplicatesNone: "Geen dubbel gevonden.",
    reasons: { email: "Zelfde e-mail", phone: "Zelfde telefoon", name: "Bijna dezelfde naam" },
    keep: "{name} houden",
    keepOf: "{name} houden en {other} erin samenvoegen",
    mergeConfirm: "{other} samenvoegen in {name}? Dit is definitief.",
    merged: "Fiches samengevoegd.",
    importTitle: "Contacten importeren",
    importIntro: "Een CSV-bestand (rekenblad, mailprogramma) of vCard (telefoon). Gekende e-mails worden overgeslagen.",
    importFile: "Bestand",
    importPreview: "{n} contact(en) klaar om te importeren",
    importIgnored: "{n} regel(s) zonder naam overgeslagen",
    importTags: "Toe te kennen labels",
    importRun: "Importeren",
    importDone: "{created} contact(en) geïmporteerd, {skipped} al gekend.",
    importNone: "Geen leesbaar contact in dit bestand.",
    importOpen: "Importeren",
    pickerCreate: "Een contact aanmaken",
    pickerCreateTitle: "Nieuw contact",
    pickerName: "Naam",
    pickerCompany: "Organisatie",
    pickerEmail: "E-mail",
    pickerPhone: "Telefoon",
    pickerAdd: "Aanmaken en kiezen",
    pickerCancel: "Annuleren",
    pickerCreated: "Contact aangemaakt en gekozen.",
    pickerLoading: "Contacten laden…",
    supplier: "Leverancier",
    donor: "Schenker (adresboek)",
  },
  en: {
    tabs: "Views of the contact book",
    tabContacts: "Contacts",
    tabOrganizations: "Organisations",
    tabDuplicates: "Duplicates",
    open: "Open the sheet",
    openOf: "Open the sheet of {name}",
    lastContact: "Last contact",
    never: "Never",
    organization: "Organisation",
    organizationHint: "Pick one in the list or type a new name: the organisation is created.",
    kinds: { company: "Company", public: "Public authority", foundation: "Foundation", federation: "Federation", supplier: "Supplier", venue: "Venue", media: "Media", other: "Other" },
    kind: "Type",
    website: "Website",
    address: "Address",
    newOrganization: "New organisation",
    editOrganization: "Edit the organisation",
    deleteOrganization: "Delete",
    deleteOrganizationOf: "Delete the organisation {name} (its contacts stay)",
    organizationsEmpty: "No organisation yet.",
    contactsCount: "{n} contact(s)",
    log: "Exchange log",
    logLabel: "What was said, in one line",
    logHint: "Type one line, then choose: call, email, meeting or note.",
    interactionKinds: { call: "Call", email: "Email", meeting: "Meeting", note: "Note", sent: "Sent by the application" },
    logAs: "Save as {kind}",
    logEmpty: "No exchange noted.",
    removeLine: "Delete the line of {date}",
    automatic: "automatic",
    sources: { partner_report: "Sponsor report shared", merge: "Sheet merged" },
    linked: "Linked to",
    linkedEmpty: "This contact is linked to nothing yet.",
    linkedKinds: { grants: "Grants", partners: "Sponsors", funders: "Grant funders", donations: "Donations", chairs: "Chairs (supplier)", venues: "Venues", events: "Events", tasks: "Tasks" },
    donationsTotal: "{year}: {total}",
    nextAction: "Next step",
    nextActionTitle: "What",
    nextActionDue: "By",
    nextActionWho: "Who",
    nextActionAdd: "Add to the to-do",
    nextActionAdded: "Added to the to-do.",
    nobody: "Nobody",
    gdpr: "Privacy",
    legalBasis: "Legal basis",
    legalBases: { legitimate_interest: "Legitimate interest", consent: "Consent", contract: "Contract", legal_obligation: "Legal obligation" },
    contactOk: "Agrees to be contacted",
    contactNo: "Does not wish to be contacted",
    consentOn: "Consent given on",
    exportData: "Export their data",
    erase: "Erase this contact",
    eraseConfirm: "Erase this contact and their log for good? The linked files keep their text.",
    erased: "Contact erased.",
    duplicatesIntro: "These sheets seem to be the same person. Choose the one to keep: the other is merged into it, with its history.",
    duplicatesNone: "No duplicate found.",
    reasons: { email: "Same email", phone: "Same phone", name: "Very close name" },
    keep: "Keep {name}",
    keepOf: "Keep {name} and merge {other} into it",
    mergeConfirm: "Merge {other} into {name}? This cannot be undone.",
    merged: "Sheets merged.",
    importTitle: "Import contacts",
    importIntro: "A CSV file (spreadsheet, mail program) or a vCard (phone). Emails already known are skipped.",
    importFile: "File",
    importPreview: "{n} contact(s) ready to import",
    importIgnored: "{n} line(s) without a name skipped",
    importTags: "Tags to give",
    importRun: "Import",
    importDone: "{created} contact(s) imported, {skipped} already known.",
    importNone: "No readable contact in this file.",
    importOpen: "Import",
    pickerCreate: "Create a contact",
    pickerCreateTitle: "New contact",
    pickerName: "Name",
    pickerCompany: "Organisation",
    pickerEmail: "Email",
    pickerPhone: "Phone",
    pickerAdd: "Create and choose",
    pickerCancel: "Cancel",
    pickerCreated: "Contact created and chosen.",
    pickerLoading: "Loading the contacts…",
    supplier: "Supplier",
    donor: "Donor (contact book)",
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
