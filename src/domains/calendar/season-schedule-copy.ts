/** H9: the « Calendrier de la saison » email, in the language of the person who plans (fr, nl, en). */
export const scheduleMail = {
  fr: {
    subject: "Calendrier de la saison",
    text: "Bonjour,\n\nLes entraînements de la saison sont dans l'agenda du club, congés scolaires et jours fériés déjà retirés. Ajoutez-les à l'agenda de votre téléphone avec votre lien d'abonnement : il se met à jour tout seul.",
    button: "Ajouter à mon agenda",
  },
  nl: {
    subject: "Kalender van het seizoen",
    text: "Hallo,\n\nDe trainingen van het seizoen staan in de agenda van de club, schoolvakanties en feestdagen al weggelaten. Voeg ze toe aan de agenda van uw telefoon met uw abonnementslink: die werkt zichzelf bij.",
    button: "Aan mijn agenda toevoegen",
  },
  en: {
    subject: "Season calendar",
    text: "Hello,\n\nThe season's trainings are in the club's calendar, school holidays and public holidays already left out. Add them to your phone's calendar with your subscription link: it updates itself.",
    button: "Add to my calendar",
  },
} as const;
