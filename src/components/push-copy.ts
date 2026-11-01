import type { Locale } from "@/lib/locale";

/**
 * B4: push notifications. `messages` are what reaches the phone: never a
 * sensitive detail, only the club, the kind of news and a child's first
 * name; the rest is read in the application. `page` is the activation card.
 */
export type PushTopic = "invitation" | "change" | "urgent" | "dues" | "document" | "message" | "other";
export const pushTopics: PushTopic[] = ["invitation", "urgent", "change", "dues", "document", "message", "other"];
type Copy = {
  messages: Record<PushTopic, string> & { invitationFor: string; grouped: string; test: string; present: string; absent: string; answered: string; closed: string };
  page: {
    title: string;
    intro: string;
    notConfigured: string;
    unsupported: string;
    iphone: string;
    denied: string;
    enable: string;
    disable: string;
    enabled: string;
    disabled: string;
    devices: string;
    noDevices: string;
    remove: string;
    since: string;
    thisDevice: string;
    test: string;
    testSent: string;
    topics: string;
    topicsHint: string;
    topicLabels: Record<PushTopic, string>;
    topicHints: Partial<Record<PushTopic, string>>;
    save: string;
    saved: string;
    unavailable: string;
    errors: Record<string, string>;
  };
};

export const pushCopy: Record<Locale, Copy> = {
  fr: {
    messages: {
      invitation: "Nouvelle invitation : répondez présent ou absent.",
      invitationFor: "Nouvelle invitation pour {child} : répondez présent ou absent.",
      change: "Un rendez-vous a changé. Ouvrez l'application pour le détail.",
      urgent: "Changement de dernière minute : un rendez-vous des prochaines 48 heures a changé.",
      dues: "Une cotisation vous attend.",
      document: "Un document demande votre attention.",
      message: "Nouveau message du club.",
      other: "Nouvelle information dans l'application.",
      grouped: "{n} nouvelles notifications du club.",
      test: "Les notifications fonctionnent sur cet appareil.",
      present: "Présent",
      absent: "Absent",
      answered: "Réponse enregistrée.",
      closed: "Réponse impossible ici : ouvrez l'application.",
    },
    page: {
      title: "Notifications sur ce téléphone",
      intro: "Une salle annulée ou un horaire déplacé arrive tout de suite sur l'appareil, sans attendre l'e-mail. Le message ne montre jamais de détail sensible.",
      notConfigured: "Les notifications sur téléphone ne sont pas encore activées pour cette plateforme.",
      unsupported: "Ce navigateur ne reçoit pas de notifications.",
      iphone: "Sur iPhone ou iPad (iOS 16.4 ou plus récent) : ouvrez l'application dans Safari, touchez « Partager » puis « Sur l'écran d'accueil », ouvrez-la depuis cette icône et activez ici.",
      denied: "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis revenez ici.",
      enable: "Activer sur cet appareil",
      disable: "Désactiver sur cet appareil",
      enabled: "Activées sur cet appareil.",
      disabled: "Désactivées sur cet appareil.",
      devices: "Appareils qui reçoivent les notifications",
      noDevices: "Aucun appareil pour l'instant.",
      remove: "Retirer",
      since: "depuis le {date}",
      thisDevice: "cet appareil",
      test: "Envoyer un essai",
      testSent: "Essai envoyé. Il arrive dans la minute.",
      topics: "Ce qui arrive sur le téléphone",
      topicsHint: "Pour chaque club. Les e-mails et l'application se règlent plus haut.",
      topicLabels: {
        invitation: "Invitations",
        urgent: "Urgent",
        change: "Changements de rendez-vous",
        dues: "Cotisations",
        document: "Documents",
        message: "Messages du club",
        other: "Autres informations",
      },
      topicHints: { invitation: "Avec « Présent » et « Absent » dans la notification.", urgent: "Annulation ou déplacement à moins de 48 heures." },
      save: "Enregistrer",
      saved: "Enregistré.",
      unavailable: "Les notifications sur téléphone ne sont pas disponibles pour le moment.",
      errors: { PUSH_NOT_CONFIGURED: "Les notifications sur téléphone ne sont pas encore activées pour cette plateforme.", NO_DEVICE: "Aucun appareil n'est activé." },
    },
  },
  nl: {
    messages: {
      invitation: "Nieuwe uitnodiging: antwoord aanwezig of afwezig.",
      invitationFor: "Nieuwe uitnodiging voor {child}: antwoord aanwezig of afwezig.",
      change: "Een afspraak is gewijzigd. Open de toepassing voor de details.",
      urgent: "Wijziging op het laatste moment: een afspraak van de komende 48 uur is gewijzigd.",
      dues: "Er wacht een lidgeld op u.",
      document: "Een document vraagt uw aandacht.",
      message: "Nieuw bericht van de club.",
      other: "Nieuwe informatie in de toepassing.",
      grouped: "{n} nieuwe meldingen van de club.",
      test: "Meldingen werken op dit toestel.",
      present: "Aanwezig",
      absent: "Afwezig",
      answered: "Antwoord opgeslagen.",
      closed: "Antwoorden kan hier niet: open de toepassing.",
    },
    page: {
      title: "Meldingen op deze telefoon",
      intro: "Een geannuleerde zaal of een verplaatst uur komt meteen op het toestel, zonder op de e-mail te wachten. Het bericht toont nooit gevoelige details.",
      notConfigured: "Meldingen op de telefoon zijn nog niet geactiveerd voor dit platform.",
      unsupported: "Deze browser ontvangt geen meldingen.",
      iphone: "Op iPhone of iPad (iOS 16.4 of recenter): open de toepassing in Safari, tik op « Deel » en dan « Zet op beginscherm », open ze via dat icoon en activeer hier.",
      denied: "Meldingen zijn geblokkeerd voor deze site. Sta ze toe in de instellingen van de browser en kom dan hier terug.",
      enable: "Activeren op dit toestel",
      disable: "Uitschakelen op dit toestel",
      enabled: "Geactiveerd op dit toestel.",
      disabled: "Uitgeschakeld op dit toestel.",
      devices: "Toestellen die meldingen ontvangen",
      noDevices: "Nog geen toestel.",
      remove: "Verwijderen",
      since: "sinds {date}",
      thisDevice: "dit toestel",
      test: "Test versturen",
      testSent: "Test verstuurd. Hij komt binnen de minuut aan.",
      topics: "Wat er op de telefoon komt",
      topicsHint: "Per club. E-mails en de toepassing stelt u hierboven in.",
      topicLabels: {
        invitation: "Uitnodigingen",
        urgent: "Dringend",
        change: "Gewijzigde afspraken",
        dues: "Lidgelden",
        document: "Documenten",
        message: "Berichten van de club",
        other: "Andere informatie",
      },
      topicHints: { invitation: "Met « Aanwezig » en « Afwezig » in de melding.", urgent: "Annulering of verplaatsing binnen de 48 uur." },
      save: "Opslaan",
      saved: "Opgeslagen.",
      unavailable: "Meldingen op de telefoon zijn momenteel niet beschikbaar.",
      errors: { PUSH_NOT_CONFIGURED: "Meldingen op de telefoon zijn nog niet geactiveerd voor dit platform.", NO_DEVICE: "Er is geen toestel geactiveerd." },
    },
  },
  en: {
    messages: {
      invitation: "New invitation: answer present or absent.",
      invitationFor: "New invitation for {child}: answer present or absent.",
      change: "An appointment has changed. Open the application for the details.",
      urgent: "Last-minute change: an appointment in the next 48 hours has changed.",
      dues: "A membership fee is waiting for you.",
      document: "A document needs your attention.",
      message: "New message from the club.",
      other: "New information in the application.",
      grouped: "{n} new notifications from the club.",
      test: "Notifications work on this device.",
      present: "Present",
      absent: "Absent",
      answered: "Answer saved.",
      closed: "Cannot answer here: open the application.",
    },
    page: {
      title: "Notifications on this phone",
      intro: "A cancelled hall or a moved time reaches the device at once, without waiting for the e-mail. The message never shows a sensitive detail.",
      notConfigured: "Phone notifications are not switched on for this platform yet.",
      unsupported: "This browser does not receive notifications.",
      iphone: "On iPhone or iPad (iOS 16.4 or later): open the application in Safari, tap « Share » then « Add to Home Screen », open it from that icon and switch on here.",
      denied: "Notifications are blocked for this site. Allow them in the browser settings, then come back here.",
      enable: "Switch on for this device",
      disable: "Switch off for this device",
      enabled: "Switched on for this device.",
      disabled: "Switched off for this device.",
      devices: "Devices receiving notifications",
      noDevices: "No device yet.",
      remove: "Remove",
      since: "since {date}",
      thisDevice: "this device",
      test: "Send a test",
      testSent: "Test sent. It arrives within a minute.",
      topics: "What reaches the phone",
      topicsHint: "For each club. E-mails and the application are set above.",
      topicLabels: {
        invitation: "Invitations",
        urgent: "Urgent",
        change: "Changed appointments",
        dues: "Membership fees",
        document: "Documents",
        message: "Club messages",
        other: "Other information",
      },
      topicHints: { invitation: "With « Present » and « Absent » in the notification.", urgent: "Cancellation or move within 48 hours." },
      save: "Save",
      saved: "Saved.",
      unavailable: "Phone notifications are not available right now.",
      errors: { PUSH_NOT_CONFIGURED: "Phone notifications are not switched on for this platform yet.", NO_DEVICE: "No device is switched on." },
    },
  },
};
