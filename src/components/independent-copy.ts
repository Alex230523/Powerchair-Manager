import type { Locale } from "@/lib/locale";

/**
 * 12/11/2026, clubs without a federation: the console's requests and
 * discount codes, and the club's own trial and code on « Abonnement à la
 * plateforme ».
 */
type Copy = {
  requests: {
    title: string;
    intro: string;
    none: string;
    pending: string;
    approved: string;
    refused: string;
    from: string;
    sentOn: string;
    decided: string;
    code: string;
    codeUsable: string;
    codeUnusable: string;
    approve: string;
    approveConfirm: string;
    approved_: string;
    refuse: string;
    reason: string;
    reasonHelp: string;
    refuseSend: string;
    refused_: string;
    open: string;
    readOnly: string;
    countries: Record<"BE" | "NL" | "FR" | "GB" | "US", string>;
  };
  discounts: {
    title: string;
    intro: string;
    none: string;
    add: string;
    edit: string;
    code: string;
    codeHelp: string;
    kind: string;
    percent: string;
    amount: string;
    value: string;
    cycles: string;
    cyclesOne: string;
    cyclesAll: string;
    cyclesN: string;
    validUntil: string;
    maxUses: string;
    maxUsesHelp: string;
    note: string;
    active: string;
    inactive: string;
    used: string;
    usable: string;
    unusable: string;
    save: string;
    saved: string;
    apply: string;
    applyFor: string;
    applied: string;
    trialUntil: string;
    withCode: string;
    auto: string;
  };
  club: {
    trial: string;
    trialOver: string;
    autoInvoice: string;
    codeApplied: string;
    codeTitle: string;
    codeIntro: string;
    codeLabel: string;
    codeHelp: string;
    codeSend: string;
    codeDone: string;
    percentOff: string;
    amountOff: string;
    firstInvoice: string;
    nInvoices: string;
    allInvoices: string;
  };
};

const fr: Copy = {
  requests: {
    title: "Demandes de club sans fédération",
    intro: "Chaque demande confirmée par e-mail attend votre décision. Acceptée : le club est créé sans fédération, sa présidence invitée, 30 jours d'essai puis 99 € par an. Refusée : le demandeur reçoit votre raison.",
    none: "Aucune demande en attente.",
    pending: "En attente",
    approved: "Acceptée",
    refused: "Refusée",
    from: "Par {name}, {email}",
    sentOn: "Confirmée le {day}",
    decided: "{state} le {day} par {name}",
    code: "Code de réduction : {code}",
    codeUsable: "valable",
    codeUnusable: "pas valable, le club démarrera sans",
    approve: "Accepter et inviter",
    approveConfirm: "Le club « {club} » sera créé sans fédération et {email} recevra son invitation de présidence.",
    approved_: "Club créé, invitation envoyée.",
    refuse: "Refuser",
    reason: "Raison du refus",
    reasonHelp: "Envoyée telle quelle au demandeur par e-mail.",
    refuseSend: "Refuser et prévenir",
    refused_: "Demande refusée, le demandeur est prévenu.",
    open: "Ouvrir le club",
    readOnly: "Seuls les opérateurs owner et support décident des demandes.",
    countries: { BE: "Belgique", NL: "Pays-Bas", FR: "France", GB: "Royaume-Uni", US: "États-Unis" },
  },
  discounts: {
    title: "Codes de réduction",
    intro: "Un code baisse les factures d'un abonnement : en pourcentage ou d'un montant, sur la première facture, plusieurs ou toutes. Donnez-le à un club : il le saisit à sa demande ou sur sa page d'abonnement.",
    none: "Aucun code pour l'instant.",
    add: "Nouveau code",
    edit: "Modifier",
    code: "Code",
    codeHelp: "4 à 30 lettres, chiffres ou traits d'union ; mis en capitales.",
    kind: "Réduction",
    percent: "Pourcentage",
    amount: "Montant (€)",
    value: "Valeur",
    cycles: "Factures concernées",
    cyclesOne: "La première facture",
    cyclesAll: "Toutes les factures",
    cyclesN: "{n} factures",
    validUntil: "Valable jusqu'au (facultatif)",
    maxUses: "Utilisations au plus (facultatif)",
    maxUsesHelp: "Vide : sans limite.",
    note: "Note interne",
    active: "Actif",
    inactive: "Désactivé",
    used: "{n} utilisation(s)",
    usable: "Utilisable",
    unusable: "Plus utilisable",
    save: "Enregistrer",
    saved: "Code enregistré.",
    apply: "Appliquer un code",
    applyFor: "Code pour {org}",
    applied: "Code appliqué à l'abonnement.",
    trialUntil: "essai jusqu'au {day}",
    withCode: "code {code}",
    auto: "facturé automatiquement",
  },
  club: {
    trial: "Essai gratuit jusqu'au {day} : la facture de l'année partira ce jour-là.",
    trialOver: "Essai terminé le {day}.",
    autoInvoice: "La facture part chaque année, sans démarche de votre part : payable en ligne ou par virement.",
    codeApplied: "Code {code} appliqué : {what}.",
    codeTitle: "Code de réduction",
    codeIntro: "L'équipe de la plateforme vous a donné un code ? Saisissez-le avant la fin de votre essai pour qu'il compte sur la première facture.",
    codeLabel: "Code",
    codeHelp: "Lettres, chiffres et traits d'union, comme vous l'avez reçu.",
    codeSend: "Appliquer le code",
    codeDone: "Code appliqué.",
    percentOff: "-{n} %",
    amountOff: "-{amount}",
    firstInvoice: "sur la première facture",
    nInvoices: "sur {n} factures",
    allInvoices: "sur toutes les factures",
  },
};

const nl: Copy = {
  requests: {
    title: "Aanvragen van clubs zonder federatie",
    intro: "Elke per e-mail bevestigde aanvraag wacht op uw beslissing. Aanvaard: de club wordt zonder federatie aangemaakt, het voorzitterschap uitgenodigd, 30 dagen proefperiode en daarna 99 € per jaar. Geweigerd: de aanvrager krijgt uw reden.",
    none: "Geen wachtende aanvraag.",
    pending: "Wachtend",
    approved: "Aanvaard",
    refused: "Geweigerd",
    from: "Door {name}, {email}",
    sentOn: "Bevestigd op {day}",
    decided: "{state} op {day} door {name}",
    code: "Kortingscode: {code}",
    codeUsable: "geldig",
    codeUnusable: "niet geldig, de club start zonder",
    approve: "Aanvaarden en uitnodigen",
    approveConfirm: "De club « {club} » wordt zonder federatie aangemaakt en {email} krijgt de uitnodiging voor het voorzitterschap.",
    approved_: "Club aangemaakt, uitnodiging verstuurd.",
    refuse: "Weigeren",
    reason: "Reden van de weigering",
    reasonHelp: "Zoals ze is per e-mail naar de aanvrager gestuurd.",
    refuseSend: "Weigeren en verwittigen",
    refused_: "Aanvraag geweigerd, de aanvrager is verwittigd.",
    open: "De club openen",
    readOnly: "Alleen de operatoren owner en support beslissen over de aanvragen.",
    countries: { BE: "België", NL: "Nederland", FR: "Frankrijk", GB: "Verenigd Koninkrijk", US: "Verenigde Staten" },
  },
  discounts: {
    title: "Kortingscodes",
    intro: "Een code verlaagt de facturen van een abonnement: in procent of met een bedrag, op de eerste factuur, enkele of alle. Geef hem aan een club: die vult hem in bij de aanvraag of op zijn abonnementspagina.",
    none: "Nog geen code.",
    add: "Nieuwe code",
    edit: "Wijzigen",
    code: "Code",
    codeHelp: "4 tot 30 letters, cijfers of koppeltekens; in hoofdletters gezet.",
    kind: "Korting",
    percent: "Percentage",
    amount: "Bedrag (€)",
    value: "Waarde",
    cycles: "Betrokken facturen",
    cyclesOne: "De eerste factuur",
    cyclesAll: "Alle facturen",
    cyclesN: "{n} facturen",
    validUntil: "Geldig tot (facultatief)",
    maxUses: "Hoogstens zoveel keer (facultatief)",
    maxUsesHelp: "Leeg: zonder limiet.",
    note: "Interne notitie",
    active: "Actief",
    inactive: "Uitgeschakeld",
    used: "{n} keer gebruikt",
    usable: "Bruikbaar",
    unusable: "Niet meer bruikbaar",
    save: "Opslaan",
    saved: "Code opgeslagen.",
    apply: "Een code toepassen",
    applyFor: "Code voor {org}",
    applied: "Code toegepast op het abonnement.",
    trialUntil: "proefperiode tot {day}",
    withCode: "code {code}",
    auto: "automatisch gefactureerd",
  },
  club: {
    trial: "Gratis proefperiode tot {day}: de factuur van het jaar vertrekt die dag.",
    trialOver: "Proefperiode beëindigd op {day}.",
    autoInvoice: "De factuur vertrekt elk jaar, zonder dat u iets moet doen: online of per overschrijving te betalen.",
    codeApplied: "Code {code} toegepast: {what}.",
    codeTitle: "Kortingscode",
    codeIntro: "Gaf het team van het platform u een code? Vul hem in voor het einde van uw proefperiode zodat hij meetelt op de eerste factuur.",
    codeLabel: "Code",
    codeHelp: "Letters, cijfers en koppeltekens, zoals u hem kreeg.",
    codeSend: "De code toepassen",
    codeDone: "Code toegepast.",
    percentOff: "-{n} %",
    amountOff: "-{amount}",
    firstInvoice: "op de eerste factuur",
    nInvoices: "op {n} facturen",
    allInvoices: "op alle facturen",
  },
};

const en: Copy = {
  requests: {
    title: "Requests from clubs without a federation",
    intro: "Each request confirmed by e-mail waits for your decision. Accepted: the club is created without a federation, its presidency invited, 30 days of trial then 99 € a year. Refused: the requester receives your reason.",
    none: "No request waiting.",
    pending: "Waiting",
    approved: "Accepted",
    refused: "Refused",
    from: "By {name}, {email}",
    sentOn: "Confirmed on {day}",
    decided: "{state} on {day} by {name}",
    code: "Discount code: {code}",
    codeUsable: "valid",
    codeUnusable: "not valid, the club will start without it",
    approve: "Accept and invite",
    approveConfirm: "The club « {club} » will be created without a federation and {email} will receive the presidency invitation.",
    approved_: "Club created, invitation sent.",
    refuse: "Refuse",
    reason: "Reason for the refusal",
    reasonHelp: "Sent as written to the requester by e-mail.",
    refuseSend: "Refuse and tell them",
    refused_: "Request refused, the requester is told.",
    open: "Open the club",
    readOnly: "Only the owner and support operators decide on the requests.",
    countries: { BE: "Belgium", NL: "Netherlands", FR: "France", GB: "United Kingdom", US: "United States" },
  },
  discounts: {
    title: "Discount codes",
    intro: "A code lowers a subscription's invoices: by a percentage or an amount, on the first invoice, several or all. Give it to a club: it types it in its request or on its subscription page.",
    none: "No code yet.",
    add: "New code",
    edit: "Edit",
    code: "Code",
    codeHelp: "4 to 30 letters, digits or hyphens; put in capitals.",
    kind: "Discount",
    percent: "Percentage",
    amount: "Amount (€)",
    value: "Value",
    cycles: "Invoices concerned",
    cyclesOne: "The first invoice",
    cyclesAll: "All invoices",
    cyclesN: "{n} invoices",
    validUntil: "Valid until (optional)",
    maxUses: "Uses at most (optional)",
    maxUsesHelp: "Empty: no limit.",
    note: "Internal note",
    active: "Active",
    inactive: "Switched off",
    used: "Used {n} time(s)",
    usable: "Usable",
    unusable: "No longer usable",
    save: "Save",
    saved: "Code saved.",
    apply: "Apply a code",
    applyFor: "Code for {org}",
    applied: "Code applied to the subscription.",
    trialUntil: "trial until {day}",
    withCode: "code {code}",
    auto: "invoiced automatically",
  },
  club: {
    trial: "Free trial until {day}: the year's invoice leaves that day.",
    trialOver: "Trial ended on {day}.",
    autoInvoice: "The invoice leaves every year, with nothing to do on your side: paid online or by bank transfer.",
    codeApplied: "Code {code} applied: {what}.",
    codeTitle: "Discount code",
    codeIntro: "Did the platform's team give you a code? Type it before your trial ends so that it counts on the first invoice.",
    codeLabel: "Code",
    codeHelp: "Letters, digits and hyphens, as you received it.",
    codeSend: "Apply the code",
    codeDone: "Code applied.",
    percentOff: "-{n} %",
    amountOff: "-{amount}",
    firstInvoice: "on the first invoice",
    nInvoices: "on {n} invoices",
    allInvoices: "on all invoices",
  },
};

export const independentCopy: Record<Locale, Copy> = { fr, nl, en };
