/**
 * 21: the public texts of the service (conditions, privacy policy,
 * processing agreement, list of sub-processors), in the three languages.
 * DRAFTS, to be reviewed by a lawyer before other clubs are welcomed: they
 * are not legal advice. docs/legal/ is written from this file
 * (scripts/legal-docs.ts), so the pages and the documents never differ.
 */
export const legalDocs = ["terms", "privacy", "dpa", "subprocessors"] as const;
export type LegalDoc = (typeof legalDocs)[number];
type Lang = "fr" | "nl" | "en";
export type LegalText = { title: string; summary?: string[]; sections: { heading: string; body: string[] }[] };
/** The version of the processing agreement: a new date asks every club to accept again. */
export const DPA_VERSION = "2026-11-02";
export const LEGAL_UPDATED = "2026-11-02";
/** The hosting and the sub-processors, as declared publicly. */
export const subprocessors = [
  { name: { fr: "Hébergement de l'application", nl: "Hosting van de toepassing", en: "Application hosting" }, role: { fr: "Serveurs qui font tourner le service", nl: "Servers waarop de dienst draait", en: "Servers running the service" }, region: "UE" },
  { name: { fr: "Base de données PostgreSQL", nl: "PostgreSQL-databank", en: "PostgreSQL database" }, role: { fr: "Stockage des données et des fichiers, chiffrés", nl: "Opslag van gegevens en bestanden, versleuteld", en: "Storage of data and files, encrypted" }, region: "UE" },
  { name: { fr: "Envoi des emails (SMTP)", nl: "Verzending van e-mails (SMTP)", en: "Email sending (SMTP)" }, role: { fr: "Acheminement des notifications par email", nl: "Verzending van meldingen per e-mail", en: "Delivery of email notifications" }, region: "UE" },
  { name: { fr: "Notifications du navigateur (Web Push)", nl: "Browsermeldingen (Web Push)", en: "Browser notifications (Web Push)" }, role: { fr: "Service de notification du navigateur de l'utilisateur, sans contenu lisible", nl: "Meldingsdienst van de browser van de gebruiker, zonder leesbare inhoud", en: "The user's browser notification service, with no readable content" }, region: { fr: "Selon le navigateur", nl: "Volgens de browser", en: "Depends on the browser" } },
] as const;
const review: Record<Lang, string> = {
  fr: "Brouillon à faire relire par un juriste. Ce texte n'est pas un avis juridique.",
  nl: "Ontwerp, na te lezen door een jurist. Deze tekst is geen juridisch advies.",
  en: "Draft to be reviewed by a lawyer. This text is not legal advice.",
};
export const reviewNotice = review;

export const legalTexts: Record<LegalDoc, Record<Lang, LegalText>> = {
  terms: {
    fr: {
      title: "Conditions d'utilisation du service",
      sections: [
        { heading: "Qui fournit quoi", body: ["Powerchair Football Manager est un service en ligne de gestion pour les clubs et les fédérations de powerchair football. L'exploitant du service fournit l'application, son hébergement et son assistance.", "Chaque club reste responsable des données qu'il y enregistre et de l'usage qu'en font ses membres."] },
        { heading: "Accès", body: ["Le club ouvre l'accès à ses membres par invitation. Chaque personne garde son compte personnel et ne voit que ce que ses rôles lui permettent.", "Le club veille à ce que les rôles donnés correspondent aux besoins réels."] },
        { heading: "Disponibilité", body: ["L'exploitant fait de son mieux pour que le service reste disponible et sauvegardé, sans garantie de disponibilité permanente. Les interruptions prévues sont annoncées à l'avance quand c'est possible."] },
        { heading: "Responsabilités", body: ["L'exploitant répond des fautes dans l'exploitation du service. Il ne répond pas des contenus saisis par les clubs ni des décisions prises à partir de ces contenus.", "Le club répond du respect des règles qui s'appliquent à ses activités (assurances, règlements sportifs, protection des mineurs)."] },
        { heading: "Fin du contrat", body: ["Le club peut arrêter à tout moment depuis Réglages › Club › Sécurité et données : un export complet lui est proposé, puis ses données sont supprimées après un délai de réflexion de 30 jours, sauf la comptabilité que la loi impose de garder."] },
        { heading: "Droit applicable", body: ["Ces conditions relèvent du droit belge. En cas de désaccord, les parties cherchent d'abord une solution amiable."] },
      ],
    },
    nl: {
      title: "Gebruiksvoorwaarden van de dienst",
      sections: [
        { heading: "Wie levert wat", body: ["Powerchair Football Manager is een onlinedienst voor het beheer van clubs en federaties voor powerchair football. De exploitant levert de toepassing, de hosting en de ondersteuning.", "Elke club blijft verantwoordelijk voor de gegevens die hij invoert en voor het gebruik dat zijn leden ervan maken."] },
        { heading: "Toegang", body: ["De club geeft zijn leden toegang via een uitnodiging. Iedereen houdt zijn persoonlijke account en ziet enkel wat zijn rollen toelaten.", "De club zorgt ervoor dat de toegekende rollen overeenstemmen met de werkelijke noden."] },
        { heading: "Beschikbaarheid", body: ["De exploitant doet zijn best om de dienst beschikbaar en geback-upt te houden, zonder garantie op permanente beschikbaarheid. Geplande onderbrekingen worden indien mogelijk vooraf aangekondigd."] },
        { heading: "Verantwoordelijkheden", body: ["De exploitant is aansprakelijk voor fouten in de exploitatie van de dienst. Hij is niet aansprakelijk voor de inhoud die clubs invoeren, noch voor beslissingen op basis van die inhoud.", "De club staat in voor de naleving van de regels die gelden voor zijn activiteiten (verzekeringen, sportreglementen, bescherming van minderjarigen)."] },
        { heading: "Einde van het contract", body: ["De club kan op elk moment stoppen via Instellingen › Club › Veiligheid en gegevens: hij krijgt een volledige export aangeboden, daarna worden zijn gegevens na een bedenktijd van 30 dagen verwijderd, behalve de boekhouding die de wet laat bewaren."] },
        { heading: "Toepasselijk recht", body: ["Deze voorwaarden vallen onder het Belgisch recht. Bij onenigheid zoeken de partijen eerst een minnelijke oplossing."] },
      ],
    },
    en: {
      title: "Terms of use of the service",
      sections: [
        { heading: "Who provides what", body: ["Powerchair Football Manager is an online management service for powerchair football clubs and federations. The operator provides the application, its hosting and its support.", "Each club remains responsible for the data it records and for the way its members use it."] },
        { heading: "Access", body: ["The club opens access to its members by invitation. Everyone keeps a personal account and only sees what their roles allow.", "The club makes sure the roles it gives match real needs."] },
        { heading: "Availability", body: ["The operator does its best to keep the service available and backed up, without any guarantee of permanent availability. Planned interruptions are announced in advance when possible."] },
        { heading: "Responsibilities", body: ["The operator is liable for faults in running the service. It is not liable for the contents entered by the clubs nor for decisions taken from them.", "The club is responsible for following the rules that apply to its activities (insurance, sports regulations, protection of minors)."] },
        { heading: "End of the contract", body: ["The club may stop at any time from Settings › Club › Security and data: a full export is offered, then its data is deleted after a 30 day cooling-off period, except the accounting the law requires to keep."] },
        { heading: "Applicable law", body: ["These terms fall under Belgian law. In case of disagreement, the parties first look for an amicable solution."] },
      ],
    },
  },
  privacy: {
    fr: {
      title: "Politique de confidentialité",
      summary: [
        "Votre club décide quelles données sont enregistrées et pourquoi ; l'exploitant les traite pour lui.",
        "Les données de santé et celles des mineurs sont réservées à quelques rôles, et chaque consultation est notée.",
        "Vos données restent dans l'Union européenne et ne sont jamais vendues.",
        "Vous pouvez demander l'accès, la correction ou l'effacement de vos données depuis Réglages › Mes données.",
      ],
      sections: [
        { heading: "Qui est responsable", body: ["Le club auquel vous appartenez est responsable du traitement de vos données. L'exploitant du service agit comme sous-traitant, sur ses instructions, selon un contrat de sous-traitance."] },
        { heading: "Quelles données", body: ["Identité et coordonnées, rôles et équipes, présences, résultats sportifs, documents, cotisations, et pour les joueurs les informations utiles à leur sécurité (classification, fauteuil, consignes de santé) quand le club les demande.", "Pour un mineur, ses responsables légaux sont associés à son compte."] },
        { heading: "Pourquoi", body: ["Organiser la vie du club : entraînements, matchs, déplacements, matériel, communication, cotisations et obligations administratives et sportives."] },
        { heading: "Combien de temps", body: ["Le club règle les durées de conservation dans des bornes ; au-delà, les données sont supprimées ou rendues anonymes automatiquement. La comptabilité est gardée le temps imposé par la loi."] },
        { heading: "Vos droits", body: ["Accès, rectification, effacement, limitation et opposition : faites la demande depuis Réglages › Mes données ; elle est transmise à votre club, qui y répond dans le délai légal. Vous pouvez aussi vous adresser à l'Autorité de protection des données."] },
        { heading: "Sécurité", body: ["Connexion protégée, droits par rôle, chiffrement des fichiers, journal des accès aux données de santé, sauvegardes régulières."] },
      ],
    },
    nl: {
      title: "Privacybeleid",
      summary: [
        "Uw club beslist welke gegevens worden bewaard en waarom; de exploitant verwerkt ze voor hem.",
        "Gezondheidsgegevens en gegevens van minderjarigen zijn voorbehouden aan enkele rollen, en elke raadpleging wordt genoteerd.",
        "Uw gegevens blijven in de Europese Unie en worden nooit verkocht.",
        "U kunt inzage, verbetering of verwijdering vragen via Instellingen › Mijn gegevens.",
      ],
      sections: [
        { heading: "Wie is verantwoordelijk", body: ["De club waartoe u behoort, is verantwoordelijk voor de verwerking van uw gegevens. De exploitant van de dienst treedt op als verwerker, op zijn instructies, volgens een verwerkersovereenkomst."] },
        { heading: "Welke gegevens", body: ["Identiteit en contactgegevens, rollen en ploegen, aanwezigheden, sportresultaten, documenten, lidgelden, en voor spelers de informatie die nodig is voor hun veiligheid (classificatie, rolstoel, gezondheidsinstructies) wanneer de club erom vraagt.", "Voor een minderjarige worden zijn wettelijke vertegenwoordigers aan zijn account gekoppeld."] },
        { heading: "Waarom", body: ["Het clubleven organiseren: trainingen, wedstrijden, verplaatsingen, materiaal, communicatie, lidgelden en administratieve en sportieve verplichtingen."] },
        { heading: "Hoe lang", body: ["De club stelt de bewaartermijnen in binnen grenzen; daarna worden de gegevens automatisch verwijderd of geanonimiseerd. De boekhouding wordt bewaard zolang de wet dat oplegt."] },
        { heading: "Uw rechten", body: ["Inzage, verbetering, verwijdering, beperking en bezwaar: dien de vraag in via Instellingen › Mijn gegevens; ze wordt aan uw club bezorgd, die binnen de wettelijke termijn antwoordt. U kunt zich ook tot de Gegevensbeschermingsautoriteit wenden."] },
        { heading: "Veiligheid", body: ["Beveiligde aanmelding, rechten per rol, versleuteling van bestanden, logboek van de toegang tot gezondheidsgegevens, regelmatige back-ups."] },
      ],
    },
    en: {
      title: "Privacy policy",
      summary: [
        "Your club decides which data is recorded and why; the operator processes it on the club's behalf.",
        "Health data and data about minors are kept for a few roles only, and every look at them is logged.",
        "Your data stays in the European Union and is never sold.",
        "You can ask for access, correction or erasure of your data from Settings › My data.",
      ],
      sections: [
        { heading: "Who is responsible", body: ["The club you belong to is the controller of your data. The operator of the service acts as processor, on its instructions, under a data processing agreement."] },
        { heading: "Which data", body: ["Identity and contact details, roles and teams, attendance, sports results, documents, fees, and for players the information needed for their safety (classification, chair, health instructions) when the club asks for it.", "For a minor, the legal representatives are linked to the account."] },
        { heading: "Why", body: ["To run the club: trainings, matches, trips, equipment, communication, fees and administrative and sports obligations."] },
        { heading: "How long", body: ["The club sets retention periods within bounds; after them, data is deleted or anonymised automatically. Accounting is kept as long as the law requires."] },
        { heading: "Your rights", body: ["Access, rectification, erasure, restriction and objection: ask from Settings › My data; the request goes to your club, which answers within the legal deadline. You may also contact the Data Protection Authority."] },
        { heading: "Security", body: ["Protected sign-in, rights by role, encrypted files, a log of the access to health data, regular backups."] },
      ],
    },
  },
  dpa: {
    fr: {
      title: "Contrat de sous-traitance (article 28 du RGPD)",
      sections: [
        { heading: "Objet et durée", body: ["Le club (responsable du traitement) confie à l'exploitant (sous-traitant) le traitement des données nécessaires au service Powerchair Football Manager, pour la durée de son utilisation du service."] },
        { heading: "Catégories de données et de personnes", body: ["Membres, joueurs, parents, coachs, bénévoles, arbitres et contacts du club. Données d'identité, de contact, sportives, administratives et financières ; données de santé des joueurs (classification, consignes) et données de mineurs, catégories particulières traitées avec des mesures renforcées."] },
        { heading: "Instructions", body: ["L'exploitant ne traite les données que sur instruction documentée du club, c'est à dire par les fonctions du service et les réglages du club. Il informe le club si une instruction lui semble contraire à la réglementation."] },
        { heading: "Confidentialité et sécurité", body: ["Les personnes autorisées à traiter les données sont tenues à la confidentialité. Mesures : accès par rôle, chiffrement des fichiers et des messages en attente, journalisation des accès aux données de santé, sauvegardes, hébergement dans l'Union européenne."] },
        { heading: "Sous-traitants ultérieurs", body: ["La liste publique est tenue à jour sur la page Sous-traitants. Le club est prévenu avant tout ajout et peut s'y opposer ; l'exploitant impose à chacun les mêmes obligations."] },
        { heading: "Assistance", body: ["L'exploitant aide le club à répondre aux demandes des personnes (outil de demandes, export, rectification, effacement), à réaliser une analyse d'impact et à notifier une violation."] },
        { heading: "Violation de données", body: ["L'exploitant prévient le club sans retard injustifié, et au plus tard dans les 48 heures après en avoir pris connaissance, avec les informations disponibles."] },
        { heading: "Fin du contrat", body: ["À la fin, le club récupère ses données (export complet) ; elles sont ensuite supprimées, sauf obligation légale de conservation (comptabilité). Un certificat de suppression est remis."] },
        { heading: "Audit", body: ["L'exploitant met à disposition les informations nécessaires pour démontrer le respect de ces obligations."] },
      ],
    },
    nl: {
      title: "Verwerkersovereenkomst (artikel 28 AVG)",
      sections: [
        { heading: "Voorwerp en duur", body: ["De club (verwerkingsverantwoordelijke) vertrouwt de exploitant (verwerker) de verwerking toe van de gegevens die nodig zijn voor de dienst Powerchair Football Manager, voor de duur van zijn gebruik van de dienst."] },
        { heading: "Categorieën van gegevens en personen", body: ["Leden, spelers, ouders, coaches, vrijwilligers, scheidsrechters en contactpersonen van de club. Identiteits-, contact-, sport-, administratieve en financiële gegevens; gezondheidsgegevens van spelers (classificatie, instructies) en gegevens van minderjarigen, bijzondere categorieën die met versterkte maatregelen worden verwerkt."] },
        { heading: "Instructies", body: ["De exploitant verwerkt de gegevens enkel op gedocumenteerde instructie van de club, namelijk via de functies van de dienst en de instellingen van de club. Hij verwittigt de club als een instructie hem in strijd lijkt met de regelgeving."] },
        { heading: "Vertrouwelijkheid en veiligheid", body: ["De personen die de gegevens mogen verwerken, zijn tot geheimhouding verplicht. Maatregelen: toegang per rol, versleuteling van bestanden en wachtende berichten, logboek van de toegang tot gezondheidsgegevens, back-ups, hosting in de Europese Unie."] },
        { heading: "Subverwerkers", body: ["De openbare lijst wordt bijgehouden op de pagina Subverwerkers. De club wordt vóór elke toevoeging verwittigd en kan zich ertegen verzetten; de exploitant legt elk ervan dezelfde verplichtingen op."] },
        { heading: "Bijstand", body: ["De exploitant helpt de club om de verzoeken van personen te beantwoorden (verzoekentool, export, verbetering, verwijdering), om een effectbeoordeling uit te voeren en om een inbreuk te melden."] },
        { heading: "Inbreuk in verband met persoonsgegevens", body: ["De exploitant verwittigt de club zonder onredelijke vertraging, en uiterlijk binnen 48 uur nadat hij er kennis van kreeg, met de beschikbare informatie."] },
        { heading: "Einde van het contract", body: ["Op het einde haalt de club zijn gegevens op (volledige export); daarna worden ze verwijderd, behalve wettelijke bewaarplicht (boekhouding). Er wordt een verwijderingsattest bezorgd."] },
        { heading: "Audit", body: ["De exploitant stelt de informatie ter beschikking die nodig is om de naleving van deze verplichtingen aan te tonen."] },
      ],
    },
    en: {
      title: "Data processing agreement (GDPR article 28)",
      sections: [
        { heading: "Subject and duration", body: ["The club (controller) entrusts the operator (processor) with processing the data needed for the Powerchair Football Manager service, for as long as it uses the service."] },
        { heading: "Categories of data and people", body: ["Members, players, parents, coaches, volunteers, referees and contacts of the club. Identity, contact, sports, administrative and financial data; players' health data (classification, instructions) and data about minors, special categories processed with reinforced measures."] },
        { heading: "Instructions", body: ["The operator processes the data only on the club's documented instructions, that is through the features of the service and the club's settings. It tells the club when an instruction seems to break the rules."] },
        { heading: "Confidentiality and security", body: ["The people allowed to process the data are bound to confidentiality. Measures: access by role, encryption of files and of queued messages, a log of access to health data, backups, hosting in the European Union."] },
        { heading: "Sub-processors", body: ["The public list is kept up to date on the Sub-processors page. The club is told before any addition and may object; the operator imposes the same obligations on each of them."] },
        { heading: "Assistance", body: ["The operator helps the club answer people's requests (requests tool, export, rectification, erasure), carry out an impact assessment and notify a breach."] },
        { heading: "Personal data breach", body: ["The operator tells the club without undue delay, and at the latest within 48 hours of becoming aware of it, with the information available."] },
        { heading: "End of the contract", body: ["At the end, the club takes back its data (full export); it is then deleted, except a legal duty to keep (accounting). A deletion certificate is handed over."] },
        { heading: "Audit", body: ["The operator makes available the information needed to show these obligations are met."] },
      ],
    },
  },
  subprocessors: {
    fr: { title: "Sous-traitants ultérieurs", sections: [{ heading: "Région d'hébergement", body: ["Les données et les fichiers sont hébergés dans l'Union européenne."] }] },
    nl: { title: "Subverwerkers", sections: [{ heading: "Hostingregio", body: ["De gegevens en bestanden worden gehost in de Europese Unie."] }] },
    en: { title: "Sub-processors", sections: [{ heading: "Hosting region", body: ["Data and files are hosted in the European Union."] }] },
  },
};
/** The text of the agreement in one language, as accepted (its hash goes with the acceptance). */
export function dpaPlain(lang: Lang) {
  const t = legalTexts.dpa[lang];
  return [t.title, DPA_VERSION, ...t.sections.flatMap((s) => [s.heading, ...s.body])].join("\n");
}
