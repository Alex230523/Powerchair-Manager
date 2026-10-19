import type { Field } from "./schema";

type Lang = "fr" | "nl" | "en";
type Label = { fr: string; nl: string; en: string };
const yes: Label = { fr: "Oui", nl: "Ja", en: "Yes" };
const no: Label = { fr: "Non", nl: "Nee", en: "No" };

/**
 * Starting point modelled on the Tigerstorm club's public registration form
 * (tigerstorm.org/inscription). Choice options are written in the editor's
 * language because answers and conditions compare the option text.
 * The club adjusts wording, prices and schedule before publishing.
 */
export function tigerstormTemplate(lang: Lang) {
  const o = (...labels: Label[]) => labels.map((l) => l[lang]);
  const field = (
    key: string,
    type: Field["type"],
    label: Label,
    extra: Partial<Field> = {},
  ): Field => ({ key, type, label, required: false, options: [], ...extra });
  const fields: Field[] = [
    field(
      "address",
      "text",
      {
        fr: "Adresse complète (rue, numéro, code postal, commune)",
        nl: "Volledig adres (straat, nummer, postcode, gemeente)",
        en: "Full address (street, number, postcode, town)",
      },
      { required: true },
    ),
    field(
      "phone",
      "phone",
      {
        fr: "Téléphone du joueur",
        nl: "Telefoon van de speler",
        en: "Player's phone",
      },
      { required: true },
    ),
    field("guardian_name", "text", {
      fr: "Nom du parent ou représentant (si mineur ou sous tutelle)",
      nl: "Naam van ouder of vertegenwoordiger (bij minderjarige of bewindvoering)",
      en: "Parent or representative's name (if a minor or under guardianship)",
    }),
    field("guardian_phone", "phone", {
      fr: "Téléphone du parent ou représentant",
      nl: "Telefoon van ouder of vertegenwoordiger",
      en: "Parent or representative's phone",
    }),
    field(
      "own_chair",
      "choice",
      {
        fr: "Le joueur possède-t-il une chaise électrique ?",
        nl: "Heeft de speler een elektrische rolstoel?",
        en: "Does the player own a power wheelchair?",
      },
      { required: true, options: o(yes, no) },
    ),
    field(
      "chair_model",
      "text",
      {
        fr: "Marque et modèle de la chaise",
        nl: "Merk en model van de rolstoel",
        en: "Wheelchair make and model",
      },
      { condition: { key: "own_chair", equals: yes[lang] } },
    ),
    field(
      "control",
      "choice",
      {
        fr: "Commande utilisée pour piloter la chaise",
        nl: "Bediening van de rolstoel",
        en: "How the chair is controlled",
      },
      {
        options: o(
          {
            fr: "Joystick main droite",
            nl: "Joystick rechterhand",
            en: "Right-hand joystick",
          },
          {
            fr: "Joystick main gauche",
            nl: "Joystick linkerhand",
            en: "Left-hand joystick",
          },
          { fr: "Commande au menton", nl: "Kinbediening", en: "Chin control" },
          { fr: "Autre", nl: "Andere", en: "Other" },
        ),
      },
    ),
    field(
      "experience",
      "choice",
      {
        fr: "Expérience du powerchair football",
        nl: "Ervaring met powerchair voetbal",
        en: "Powerchair football experience",
      },
      {
        required: true,
        options: o(
          { fr: "Jamais joué", nl: "Nog nooit gespeeld", en: "Never played" },
          {
            fr: "Déjà joué en loisir",
            nl: "Al recreatief gespeeld",
            en: "Played for fun",
          },
          {
            fr: "Déjà joué en compétition",
            nl: "Al in competitie gespeeld",
            en: "Played in competition",
          },
        ),
      },
    ),
    field(
      "transfer_help",
      "choice",
      {
        fr: "Besoin d'aide pour les transferts (voiture, chaise de sport) ?",
        nl: "Hulp nodig bij transfers (auto, sportrolstoel)?",
        en: "Help needed with transfers (car, sports chair)?",
      },
      { options: o(no, yes) },
    ),
    field("support_needs", "text", {
      fr: "Informations utiles pour l'encadrement (accompagnement, sécurité, communication)",
      nl: "Nuttige info voor de begeleiding (begeleiding, veiligheid, communicatie)",
      en: "Useful information for staff (support, safety, communication)",
    }),
    field(
      "trial",
      "choice",
      {
        fr: "Souhaitez-vous d'abord une séance d'essai gratuite ?",
        nl: "Wenst u eerst een gratis proeftraining?",
        en: "Would you like a free trial session first?",
      },
      { required: true, options: o(yes, no) },
    ),
    field(
      "saturday",
      "choice",
      {
        fr: "Disponible le samedi de 11 h à 13 h ?",
        nl: "Beschikbaar op zaterdag van 11 tot 13 uur?",
        en: "Available on Saturdays from 11:00 to 13:00?",
      },
      {
        required: true,
        options: o(yes, { fr: "Parfois", nl: "Soms", en: "Sometimes" }, no),
      },
    ),
    field(
      "heard_about",
      "choice",
      {
        fr: "Comment avez-vous connu le club ?",
        nl: "Hoe hebt u de club leren kennen?",
        en: "How did you hear about the club?",
      },
      {
        options: o(
          {
            fr: "Bouche à oreille",
            nl: "Mond-tot-mondreclame",
            en: "Word of mouth",
          },
          { fr: "Réseaux sociaux", nl: "Sociale media", en: "Social media" },
          {
            fr: "École, centre ou kiné",
            nl: "School, centrum of kinesist",
            en: "School, centre or therapist",
          },
          { fr: "Fédération", nl: "Federatie", en: "Federation" },
          { fr: "Autre", nl: "Andere", en: "Other" },
        ),
      },
    ),
    field("medical_certificate", "file", {
      fr: "Certificat médical d'aptitude au sport",
      nl: "Medisch attest van sportgeschiktheid",
      en: "Medical certificate of fitness for sport",
    }),
    field("photo_consent", "consent", {
      fr: "J'autorise le club à publier des photos et vidéos du joueur prises lors des activités",
      nl: "Ik geef de club toestemming om foto's en video's van de speler tijdens activiteiten te publiceren",
      en: "I allow the club to publish photos and videos of the player taken during activities",
    }),
    field(
      "privacy_consent",
      "consent",
      {
        fr: "J'accepte que le club traite ces données pour gérer l'inscription et la vie sportive (RGPD)",
        nl: "Ik ga akkoord dat de club deze gegevens verwerkt voor de inschrijving en het sportleven (AVG)",
        en: "I agree that the club processes this data to manage the registration and sporting life (GDPR)",
      },
      { required: true },
    ),
    field(
      "rules_consent",
      "consent",
      {
        fr: "J'accepte le règlement du club et la cotisation annuelle de 250 €",
        nl: "Ik aanvaard het clubreglement en de jaarlijkse bijdrage van 250 €",
        en: "I accept the club rules and the annual fee of €250",
      },
      { required: true },
    ),
    field(
      "signature",
      "signature",
      {
        fr: "Signature du joueur ou de son représentant",
        nl: "Handtekening van de speler of vertegenwoordiger",
        en: "Signature of the player or representative",
      },
      { required: true },
    ),
  ];
  const text = {
    fr: {
      title: "Inscription au club de powerchair football",
      description:
        "Entraînements le samedi de 11 h à 13 h au Crossing (Schaerbeek). Cotisation annuelle : 250 €. La première séance d'essai est gratuite. Nous vous recontactons après réception de la demande.",
    },
    nl: {
      title: "Inschrijving bij de powerchair voetbalclub",
      description:
        "Trainingen op zaterdag van 11 tot 13 uur in de Crossing (Schaarbeek). Jaarlijkse bijdrage: 250 €. De eerste proeftraining is gratis. We nemen contact op na ontvangst van de aanvraag.",
    },
    en: {
      title: "Powerchair football club registration",
      description:
        "Training on Saturdays from 11:00 to 13:00 at the Crossing (Schaerbeek). Annual fee: €250. The first trial session is free. We get back to you once the request is received.",
    },
  }[lang];
  return { ...text, capacity: null as number | null, fields };
}
