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
 * Wave 17 (F1): the platform's own templates, neutral (no club name, no
 * account number). Name, first name and date of birth are asked by every
 * application already (« Préparer ma candidature »), so they are not
 * repeated. Choice options are written in the editor's language because
 * answers and conditions compare the option text.
 */
export const platformTemplates = ["player", "renewal", "camp"] as const;
export type PlatformTemplate = (typeof platformTemplates)[number];

export function platformTemplate(id: PlatformTemplate, lang: Lang) {
  const o = (...labels: Label[]) => labels.map((l) => l[lang]);
  const field = (key: string, type: Field["type"], label: Label, extra: Partial<Field> = {}): Field => ({
    key,
    type,
    label,
    required: false,
    options: [],
    confidential: false,
    ...extra,
  });
  // 04/11/2026: a section title groups the questions that follow; the person filling folds and unfolds it.
  const section = (key: string, label: Label) => field(key, "section", label);
  const email = field("email", "email", { fr: "Email", nl: "E-mail", en: "Email" }, { required: true, maps: "email" });
  const phone = field("phone", "phone", { fr: "Téléphone", nl: "Telefoon", en: "Phone" }, { required: true, maps: "phone" });
  const emergency = field(
    "emergency",
    "text",
    {
      fr: "Contact d'urgence : nom, prénom, lien et numéro de téléphone de cette personne",
      nl: "Noodcontact: naam, voornaam, relatie en telefoonnummer van deze persoon",
      en: "Emergency contact: name, first name, relationship and phone number",
    },
    { required: true, maps: "emergency" },
  );
  const condition = field(
    "condition",
    "text",
    { fr: "Nom et détail concernant la pathologie", nl: "Naam en details van de aandoening", en: "Name and details of the condition" },
    {
      confidential: true,
      maps: "condition",
      help: {
        fr: "Ces détails resteront strictement confidentiels au sein du club.",
        nl: "Deze gegevens blijven strikt vertrouwelijk binnen de club.",
        en: "These details stay strictly confidential within the club.",
      },
    },
  );
  const jerseySize = field(
    "jersey_size",
    "choice",
    { fr: "Taille de maillot", nl: "Shirtmaat", en: "Shirt size" },
    {
      maps: "jersey_size",
      options: [...o({ fr: "Enfant 8-10 ans", nl: "Kind 8-10 jaar", en: "Child 8-10" }, { fr: "Enfant 12-14 ans", nl: "Kind 12-14 jaar", en: "Child 12-14" }), "XS", "S", "M", "L", "XL", "XXL"],
    },
  );
  const joystick = field(
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
  );
  const photo = field(
    "photo_consent",
    "consent",
    {
      fr: "J'autorise le club à utiliser mon image (ou celle de mon enfant) pour sa communication",
      nl: "Ik geef de club toestemming om mijn beeld (of dat van mijn kind) te gebruiken voor zijn communicatie",
      en: "I allow the club to use my image (or my child's) in its communication",
    },
    {
      help: {
        fr: "Photos et vidéos des activités, sur les réseaux sociaux, le site internet et les supports du club. Facultatif, et modifiable à tout moment.",
        nl: "Foto's en video's van de activiteiten, op sociale media, de website en het materiaal van de club. Optioneel en op elk moment te wijzigen.",
        en: "Photos and videos of the activities, on social media, the website and the club's material. Optional, and can be changed at any time.",
      },
    },
  );
  const installments = field(
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
        fr: "En 2 fois : {cotisation/2} par versement ; en 3 fois : {cotisation/3} ; en 4 fois : {cotisation/4}. Le club vous envoie la demande de paiement après l'admission.",
        nl: "In 2 keer: {cotisation/2} per storting; in 3 keer: {cotisation/3}; in 4 keer: {cotisation/4}. De club stuurt u het betalingsverzoek na de toelating.",
        en: "In 2 payments: {cotisation/2} each; in 3: {cotisation/3}; in 4: {cotisation/4}. The club sends you the payment request after admission.",
      },
    },
  );
  const privacy = field(
    "privacy_consent",
    "consent",
    {
      fr: "J'accepte que le club traite ces données, y compris les informations de santé, pour l'inscription et l'encadrement sportif",
      nl: "Ik ga akkoord dat de club deze gegevens, ook gezondheidsgegevens, verwerkt voor de inschrijving en sportieve begeleiding",
      en: "I agree that the club processes this data, including health information, for registration and sports supervision",
    },
    { required: true },
  );
  if (id === "player") {
    const fields: Field[] = [
      section("section_player", { fr: "Le joueur", nl: "De speler", en: "The player" }),
      field(
        "gender",
        "multi",
        { fr: "Genre", nl: "Gender", en: "Gender" },
        {
          options: o(
            { fr: "Homme", nl: "Man", en: "Man" },
            { fr: "Femme", nl: "Vrouw", en: "Woman" },
            { fr: "Non binaire", nl: "Non-binair", en: "Non-binary" },
            { fr: "Je préfère ne pas répondre", nl: "Zeg ik liever niet", en: "Prefer not to say" },
          ),
        },
      ),
      field(
        "national_number",
        "text",
        { fr: "Numéro de registre national", nl: "Rijksregisternummer", en: "National register number" },
        {
          confidential: true,
          help: {
            fr: "Facultatif. Demandé uniquement si la fédération l'exige pour la licence ; chiffré et réservé au président.",
            nl: "Optioneel. Enkel gevraagd als de federatie het eist voor de licentie; versleuteld en voorbehouden aan de voorzitter.",
            en: "Optional. Only asked if the federation requires it for the licence; encrypted and reserved for the president.",
          },
        },
      ),
      section("section_contact", { fr: "Coordonnées", nl: "Contactgegevens", en: "Contact details" }),
      field("address", "text", { fr: "Adresse", nl: "Adres", en: "Address" }, { required: true }),
      field("postal_code", "text", { fr: "Code postal", nl: "Postcode", en: "Postcode" }, { required: true }),
      email,
      phone,
      emergency,
      field(
        "heard_about",
        "multi",
        { fr: "Comment avez-vous appris notre existence ?", nl: "Hoe hebt u ons leren kennen?", en: "How did you hear about us?" },
        {
          options: o(
            { fr: "Bouche à oreille", nl: "Mond-tot-mondreclame", en: "Word of mouth" },
            { fr: "Réseaux sociaux", nl: "Sociale media", en: "Social media" },
            { fr: "Site internet", nl: "Website", en: "Website" },
            { fr: "École, centre ou kiné", nl: "School, centrum of kinesist", en: "School, centre or therapist" },
            { fr: "Fédération", nl: "Federatie", en: "Federation" },
            { fr: "Événement ou démonstration", nl: "Evenement of demonstratie", en: "Event or demonstration" },
            { fr: "Autre", nl: "Andere", en: "Other" },
          ),
        },
      ),
      section("section_health", { fr: "Santé et équipement", nl: "Gezondheid en uitrusting", en: "Health and equipment" }),
      condition,
      jerseySize,
      field(
        "jersey_number",
        "text",
        { fr: "Numéro de joueur souhaité", nl: "Gewenst spelersnummer", en: "Preferred player number" },
        {
          maps: "jersey_number",
          help: {
            fr: "Le club vérifie avec vous que le numéro est libre.",
            nl: "De club bekijkt samen met u of het nummer nog vrij is.",
            en: "The club checks with you that the number is free.",
          },
        },
      ),
      joystick,
      section("section_agreements", { fr: "Accords et paiement", nl: "Akkoorden en betaling", en: "Agreements and payment" }),
      photo,
      installments,
      privacy,
    ];
    const text = {
      fr: {
        title: "Inscription d'un joueur",
        description:
          "Bienvenue ! La cotisation s'élève à {cotisation} par saison, payable en 1 à 4 fois. Les informations de santé restent strictement confidentielles au sein du club.",
      },
      nl: {
        title: "Inschrijving van een speler",
        description:
          "Welkom! Het lidgeld bedraagt {cotisation} per seizoen, te betalen in 1 tot 4 keer. Gezondheidsgegevens blijven strikt vertrouwelijk binnen de club.",
      },
      en: {
        title: "Player registration",
        description:
          "Welcome! The membership fee is {cotisation} per season, payable in 1 to 4 instalments. Health information stays strictly confidential within the club.",
      },
    }[lang];
    return { ...text, capacity: null as number | null, fields };
  }
  if (id === "renewal") {
    const fields: Field[] = [
      email,
      phone,
      emergency,
      field(
        "changes",
        "text",
        {
          fr: "Quelque chose a changé depuis la saison dernière (adresse, matériel, santé) ?",
          nl: "Is er iets veranderd sinds vorig seizoen (adres, materiaal, gezondheid)?",
          en: "Has anything changed since last season (address, equipment, health)?",
        },
        {
          confidential: true,
          help: {
            fr: "Laissez vide si rien n'a changé. Réponse confidentielle.",
            nl: "Leeg laten als er niets veranderd is. Vertrouwelijk antwoord.",
            en: "Leave empty if nothing changed. Confidential answer.",
          },
        },
      ),
      jerseySize,
      joystick,
      photo,
      installments,
      privacy,
    ];
    const text = {
      fr: {
        title: "Réinscription",
        description:
          "Vous étiez au club la saison dernière : vos réponses ordinaires sont reprises, il suffit de les vérifier. La cotisation s'élève à {cotisation} par saison.",
      },
      nl: {
        title: "Herinschrijving",
        description: "U was vorig seizoen bij de club: uw gewone antwoorden worden overgenomen, u hoeft ze enkel na te kijken. Het lidgeld bedraagt {cotisation} per seizoen.",
      },
      en: {
        title: "Renewal",
        description: "You were with the club last season: your usual answers are carried over, just check them. The membership fee is {cotisation} per season.",
      },
    }[lang];
    return { ...text, capacity: null as number | null, fields };
  }
  const fields: Field[] = [
    email,
    phone,
    emergency,
    field(
      "level",
      "choice",
      { fr: "Niveau de jeu", nl: "Spelniveau", en: "Playing level" },
      {
        required: true,
        options: o(
          { fr: "Découverte", nl: "Kennismaking", en: "Discovery" },
          { fr: "Débutant", nl: "Beginner", en: "Beginner" },
          { fr: "Intermédiaire", nl: "Gemiddeld", en: "Intermediate" },
          { fr: "Confirmé", nl: "Gevorderd", en: "Advanced" },
        ),
      },
    ),
    field(
      "own_chair",
      "choice",
      { fr: "Venez-vous avec votre propre fauteuil de sport ?", nl: "Komt u met uw eigen sportrolstoel?", en: "Will you bring your own sports chair?" },
      { required: true, options: o({ fr: "Oui", nl: "Ja", en: "Yes" }, { fr: "Non, j'ai besoin d'un prêt", nl: "Nee, ik heb een leenstoel nodig", en: "No, I need to borrow one" }) },
    ),
    joystick,
    field(
      "diet",
      "text",
      { fr: "Repas : régime ou allergies", nl: "Maaltijden: dieet of allergieën", en: "Meals: diet or allergies" },
      { confidential: true },
    ),
    photo,
    privacy,
  ];
  const text = {
    fr: {
      title: "Inscription à un stage",
      description: "Indiquez votre niveau et vos besoins : le club prépare le matériel et les groupes en conséquence. Les informations de santé restent confidentielles.",
    },
    nl: {
      title: "Inschrijving voor een stage",
      description: "Vermeld uw niveau en uw noden: de club bereidt het materiaal en de groepen daarop voor. Gezondheidsgegevens blijven vertrouwelijk.",
    },
    en: {
      title: "Camp registration",
      description: "Tell us your level and needs: the club prepares the equipment and the groups accordingly. Health information stays confidential.",
    },
  }[lang];
  return { ...text, capacity: null as number | null, fields };
}
