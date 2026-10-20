import type { Field } from "./schema";

type Lang = "fr" | "nl" | "en";
type Label = { fr: string; nl: string; en: string };

/**
 * The membership fee is never written in a form: the texts carry the
 * placeholders {cotisation} and {cotisation/n}, filled at read time from the
 * season's dues plan (wave 10). When the club has no plan yet the amount is
 * left out, parentheses included. Choice options never carry a placeholder:
 * answers are compared with the stored option text.
 */
const placeholder = /\s?\(?\{cotisation(?:\/(\d+))?\}\)?/g;
export function fillDues<T>(value: T, cents: number | null): T {
  if (typeof value === "string") {
    return value.replace(placeholder, (m, n: string | undefined) => {
      if (cents === null) return "";
      const part = n ? Math.ceil(cents / Number(n)) : cents;
      const euro = (part / 100).toLocaleString("fr-BE", { minimumFractionDigits: part % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
      const wrapped = m.trim().startsWith("(");
      return (m.startsWith(" ") ? " " : "") + (wrapped ? `(${euro})` : euro);
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => fillDues(v, cents)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDues(v, cents)])) as T;
  return value;
}
/** The amount of the season's standard plan: the full (highest) active plan, or null. */
export const seasonFeeSql =
  "SELECT amount_cents FROM dues_plan WHERE organization_id=$1 AND season_id=$2 AND NOT archived ORDER BY amount_cents DESC, created_at LIMIT 1";

/**
 * The Tigerstorm club's registration form, question by question.
 * Name, first name and date of birth are asked by every application already
 * ("Préparer ma candidature"), so they are not repeated here.
 * Choice options are written in the editor's language because answers and
 * conditions compare the option text.
 */
export function tigerstormTemplate(lang: Lang) {
  const o = (...labels: Label[]) => labels.map((l) => l[lang]);
  const field = (
    key: string,
    type: Field["type"],
    label: Label,
    extra: Partial<Field> = {},
  ): Field => ({
    key,
    type,
    label,
    required: false,
    options: [],
    confidential: false,
    ...extra,
  });
  const fields: Field[] = [
    field(
      "gender",
      "multi",
      { fr: "Genre", nl: "Gender", en: "Gender" },
      {
        options: o(
          { fr: "Homme", nl: "Man", en: "Man" },
          { fr: "Femme", nl: "Vrouw", en: "Woman" },
          { fr: "Non binaire", nl: "Non-binair", en: "Non-binary" },
          {
            fr: "Je préfère ne pas répondre",
            nl: "Zeg ik liever niet",
            en: "Prefer not to say",
          },
        ),
      },
    ),
    field(
      "national_number",
      "text",
      {
        fr: "Numéro de registre national",
        nl: "Rijksregisternummer",
        en: "National register number",
      },
      {
        confidential: true,
        help: {
          fr: "Facultatif. Demandé uniquement si la fédération l'exige pour la licence ; chiffré et réservé au président.",
          nl: "Optioneel. Enkel gevraagd als de federatie het eist voor de licentie; versleuteld en voorbehouden aan de voorzitter.",
          en: "Optional. Only asked if the federation requires it for the licence; encrypted and reserved for the president.",
        },
      },
    ),
    field(
      "address",
      "text",
      { fr: "Adresse", nl: "Adres", en: "Address" },
      { required: true },
    ),
    field(
      "postal_code",
      "text",
      { fr: "Code postal", nl: "Postcode", en: "Postcode" },
      { required: true },
    ),
    field(
      "email",
      "email",
      { fr: "Email", nl: "E-mail", en: "Email" },
      { required: true, maps: "email" },
    ),
    field(
      "phone",
      "phone",
      { fr: "Téléphone", nl: "Telefoon", en: "Phone" },
      { required: true, maps: "phone" },
    ),
    field(
      "emergency",
      "text",
      {
        fr: "Contact d'urgence : nom, prénom, lien et numéro de téléphone de cette personne",
        nl: "Noodcontact: naam, voornaam, relatie en telefoonnummer van deze persoon",
        en: "Emergency contact: name, first name, relationship and phone number",
      },
      { required: true, maps: "emergency" },
    ),
    field(
      "heard_about",
      "multi",
      {
        fr: "Comment avez-vous appris notre existence ?",
        nl: "Hoe hebt u ons leren kennen?",
        en: "How did you hear about us?",
      },
      {
        options: o(
          {
            fr: "Bouche à oreille",
            nl: "Mond-tot-mondreclame",
            en: "Word of mouth",
          },
          { fr: "Réseaux sociaux", nl: "Sociale media", en: "Social media" },
          { fr: "Site internet", nl: "Website", en: "Website" },
          {
            fr: "École, centre ou kiné",
            nl: "School, centrum of kinesist",
            en: "School, centre or therapist",
          },
          {
            fr: "Fédération (BPCF)",
            nl: "Federatie (BPCF)",
            en: "Federation (BPCF)",
          },
          {
            fr: "Événement ou démonstration",
            nl: "Evenement of demonstratie",
            en: "Event or demonstration",
          },
          { fr: "Autre", nl: "Andere", en: "Other" },
        ),
      },
    ),
    field(
      "condition",
      "text",
      {
        fr: "Nom et détail concernant la pathologie",
        nl: "Naam en details van de aandoening",
        en: "Name and details of the condition",
      },
      {
        confidential: true,
        maps: "condition",
        help: {
          fr: "Ces détails resteront strictement confidentiels au sein du club.",
          nl: "Deze gegevens blijven strikt vertrouwelijk binnen de club.",
          en: "These details stay strictly confidential within the club.",
        },
      },
    ),
    field(
      "jersey_size",
      "choice",
      { fr: "Taille de maillot", nl: "Shirtmaat", en: "Shirt size" },
      {
        maps: "jersey_size",
        options: [
          ...o(
            { fr: "Enfant 8-10 ans", nl: "Kind 8-10 jaar", en: "Child 8-10" },
            {
              fr: "Enfant 12-14 ans",
              nl: "Kind 12-14 jaar",
              en: "Child 12-14",
            },
          ),
          "XS",
          "S",
          "M",
          "L",
          "XL",
          "XXL",
        ],
      },
    ),
    field(
      "jersey_number",
      "text",
      { fr: "Numéro de joueur", nl: "Spelersnummer", en: "Player number" },
      {
        maps: "jersey_number",
        help: {
          fr: "Si vous êtes un nouveau joueur, vous pouvez en choisir un nouveau et nous regardons la disponibilité ensemble.",
          nl: "Als nieuwe speler kunt u een nummer kiezen; we bekijken samen of het nog vrij is.",
          en: "New players can pick a number; we check together whether it is available.",
        },
      },
    ),
    field(
      "joystick",
      "multi",
      { fr: "Joystick", nl: "Joystick", en: "Joystick" },
      {
        maps: "control",
        max: 2,
        options: o(
          { fr: "Main droite", nl: "Rechterhand", en: "Right hand" },
          { fr: "Main gauche", nl: "Linkerhand", en: "Left hand" },
          { fr: "Menton", nl: "Kin", en: "Chin" },
          { fr: "Tête", nl: "Hoofd", en: "Head" },
          { fr: "Autre", nl: "Andere", en: "Other" },
        ),
      },
    ),
    field(
      "photo_consent",
      "consent",
      {
        fr: "J'autorise les Tigerstorm à utiliser mon image (ou celle de mon enfant) pour leur communication",
        nl: "Ik geef de Tigerstorm toestemming om mijn beeld (of dat van mijn kind) te gebruiken voor hun communicatie",
        en: "I allow the Tigerstorm to use my image (or my child's) in their communication",
      },
      {
        help: {
          fr: "En cochant cette case, j'autorise l'équipe des Tigerstorm à utiliser mon image (photos, vidéos, etc.) (pour les parents, celle de mon fils/ma fille) dans le cadre de ses activités de communication, notamment sur ses réseaux sociaux, son site internet et tout support promotionnel.",
          nl: "Door dit vakje aan te vinken, geef ik het Tigerstorm-team toestemming om mijn beeld (foto's, video's, enz.) (voor ouders: dat van mijn zoon/dochter) te gebruiken voor zijn communicatie, onder meer op sociale media, de website en elk promotiemateriaal.",
          en: "By ticking this box, I allow the Tigerstorm team to use my image (photos, videos, etc.) (for parents: my son's or daughter's) in its communication, including social media, its website and any promotional material.",
        },
      },
    ),
    field(
      "installments",
      "choice",
      {
        fr: "Paiement de la cotisation ({cotisation}) : en combien de fois ?",
        nl: "Betaling van het lidgeld ({cotisation}): in hoeveel keer?",
        en: "Membership fee ({cotisation}): in how many payments?",
      },
      {
        required: true,
        maps: "installments",
        options: o(
          { fr: "1 fois", nl: "1 keer", en: "1 payment" },
          { fr: "2 fois", nl: "2 keer", en: "2 payments" },
          { fr: "3 fois", nl: "3 keer", en: "3 payments" },
          { fr: "4 fois", nl: "4 keer", en: "4 payments" },
        ),
        help: {
          fr: "En 2 fois : {cotisation/2} par versement ; en 3 fois : {cotisation/3} ; en 4 fois : {cotisation/4}. Numéro de compte de l'ASBL : BE41 3632 6208 1310. Merci d'indiquer en communication du virement le nom et le prénom du joueur ainsi que la ou les dates des prochains paiements si vous payez en plusieurs fois.",
          nl: "In 2 keer: {cotisation/2} per storting; in 3 keer: {cotisation/3}; in 4 keer: {cotisation/4}. Rekeningnummer van de vzw: BE41 3632 6208 1310. Vermeld bij de overschrijving de naam en voornaam van de speler en, bij betaling in meerdere keren, de data van de volgende betalingen.",
          en: "In 2 payments: {cotisation/2} each; in 3: {cotisation/3}; in 4: {cotisation/4}. Club account: BE41 3632 6208 1310. Please put the player's first and last name in the transfer reference and, if paying in several instalments, the dates of the next payments.",
        },
      },
    ),
    field(
      "privacy_consent",
      "consent",
      {
        fr: "J'accepte que le club traite ces données, y compris les informations de santé, pour l'inscription et l'encadrement sportif",
        nl: "Ik ga akkoord dat de club deze gegevens, ook gezondheidsgegevens, verwerkt voor de inschrijving en sportieve begeleiding",
        en: "I agree that the club processes this data, including health information, for registration and sports supervision",
      },
      { required: true },
    ),
  ];
  const text = {
    fr: {
      title: "Formulaire d'inscription",
      description:
        "Bienvenue chez les Tigerstorm ! La cotisation s'élève à {cotisation} par saison, payable en 1 à 4 fois. Numéro de compte de l'ASBL : BE41 3632 6208 1310. Les informations de santé restent strictement confidentielles au sein du club.",
    },
    nl: {
      title: "Inschrijvingsformulier",
      description:
        "Welkom bij de Tigerstorm! Het lidgeld bedraagt {cotisation} per seizoen, te betalen in 1 tot 4 keer. Rekeningnummer van de vzw: BE41 3632 6208 1310. Gezondheidsgegevens blijven strikt vertrouwelijk binnen de club.",
    },
    en: {
      title: "Registration form",
      description:
        "Welcome to the Tigerstorm! The membership fee is {cotisation} per season, payable in 1 to 4 instalments. Club account: BE41 3632 6208 1310. Health information stays strictly confidential within the club.",
    },
  }[lang];
  return { ...text, capacity: null as number | null, fields };
}
