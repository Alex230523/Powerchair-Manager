/** Wave 17 (O1): the coach's own space (tabs, driving licence) and the « Formation » column. */
type Copy = {
  tabs: string;
  profile: string;
  todo: string;
  licence: string;
  licenceHint: string;
  categories: string;
  validUntil: string;
  noDate: string;
  copy: string;
  copyOf: string;
  removeCopy: string;
  none: string;
  declare: string;
  edit: string;
  save: string;
  cancel: string;
  remove: string;
  saved: string;
  declared: string;
  verified: string;
  verify: string;
  unverify: string;
  expired: string;
  soon: string;
  pickOne: string;
  proof: string;
  proofOf: string;
  training: string;
  trained: string;
  pending: string;
  untrained: string;
  trainedTip: string;
  pendingTip: string;
};

export const coachSpaceCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    tabs: "Sections du profil",
    profile: "Profil",
    todo: "À faire",
    licence: "Permis de conduire",
    licenceHint: "Visible seulement par la personne, le président et ceux qui organisent les déplacements. Un rappel part 30 jours avant l'expiration.",
    categories: "Catégories",
    validUntil: "Valable jusqu'au",
    noDate: "Sans date de validité",
    copy: "Copie du permis (photo ou PDF, facultatif)",
    copyOf: "Voir la copie : {name}",
    removeCopy: "Retirer la copie",
    none: "Aucun permis déclaré.",
    declare: "Déclarer un permis",
    edit: "Modifier le permis",
    save: "Enregistrer",
    cancel: "Annuler",
    remove: "Supprimer le permis",
    saved: "Permis enregistré.",
    declared: "Déclaré",
    verified: "Vérifié par le club",
    verify: "Marquer comme vérifié",
    unverify: "Retirer la vérification",
    expired: "Expiré",
    soon: "Expire bientôt",
    pickOne: "Choisissez au moins une catégorie.",
    proof: "Justificatif (attestation, photo ou PDF, facultatif)",
    proofOf: "Justificatif envoyé : {name}",
    training: "Formation",
    trained: "Formé",
    pending: "En attente de validation",
    untrained: "Non formé",
    trainedTip: "{title}, validée le {date}",
    pendingTip: "Demande envoyée à la fédération : {title}",
  },
  nl: {
    tabs: "Onderdelen van het profiel",
    profile: "Profiel",
    todo: "Te doen",
    licence: "Rijbewijs",
    licenceHint: "Enkel zichtbaar voor de persoon, de voorzitter en wie de verplaatsingen organiseert. 30 dagen voor de vervaldatum volgt een herinnering.",
    categories: "Categorieën",
    validUntil: "Geldig tot",
    noDate: "Zonder geldigheidsdatum",
    copy: "Kopie van het rijbewijs (foto of pdf, optioneel)",
    copyOf: "De kopie bekijken: {name}",
    removeCopy: "De kopie verwijderen",
    none: "Geen rijbewijs aangegeven.",
    declare: "Een rijbewijs aangeven",
    edit: "Het rijbewijs wijzigen",
    save: "Opslaan",
    cancel: "Annuleren",
    remove: "Het rijbewijs verwijderen",
    saved: "Rijbewijs opgeslagen.",
    declared: "Aangegeven",
    verified: "Nagekeken door de club",
    verify: "Als nagekeken markeren",
    unverify: "De controle intrekken",
    expired: "Vervallen",
    soon: "Vervalt binnenkort",
    pickOne: "Kies minstens één categorie.",
    proof: "Bewijsstuk (attest, foto of pdf, optioneel)",
    proofOf: "Bewijsstuk verstuurd: {name}",
    training: "Opleiding",
    trained: "Opgeleid",
    pending: "Wacht op validatie",
    untrained: "Niet opgeleid",
    trainedTip: "{title}, gevalideerd op {date}",
    pendingTip: "Aanvraag verstuurd naar de federatie: {title}",
  },
  en: {
    tabs: "Profile sections",
    profile: "Profile",
    todo: "To do",
    licence: "Driving licence",
    licenceHint: "Seen only by the person, the president and those who organise the trips. A reminder goes out 30 days before it expires.",
    categories: "Categories",
    validUntil: "Valid until",
    noDate: "No expiry date",
    copy: "Copy of the licence (photo or PDF, optional)",
    copyOf: "See the copy: {name}",
    removeCopy: "Remove the copy",
    none: "No licence declared.",
    declare: "Declare a licence",
    edit: "Edit the licence",
    save: "Save",
    cancel: "Cancel",
    remove: "Delete the licence",
    saved: "Licence saved.",
    declared: "Declared",
    verified: "Checked by the club",
    verify: "Mark as checked",
    unverify: "Withdraw the check",
    expired: "Expired",
    soon: "Expires soon",
    pickOne: "Choose at least one category.",
    proof: "Proof (certificate, photo or PDF, optional)",
    proofOf: "Proof sent: {name}",
    training: "Training",
    trained: "Trained",
    pending: "Awaiting validation",
    untrained: "Not trained",
    trainedTip: "{title}, validated on {date}",
    pendingTip: "Request sent to the federation: {title}",
  },
};
