import type { Locale } from "../../lib/locale";

/** 24: the notice before the old messages go, and the PDF of the club's exchanges. */
export const archiveCopy: Record<Locale, { title: string; message: string; pdfTitle: string; thread: string; hidden: string; none: string }> = {
  fr: {
    title: "La messagerie est retirée",
    message:
      "La messagerie interne a été retirée de l'application. Les échanges de votre club seront supprimés définitivement après le {date}. Pour les garder, téléchargez-les en PDF avec ce lien (réservé à la présidence).",
    pdfTitle: "Échanges de la messagerie : {club}",
    thread: "Conversation : {subject}",
    hidden: "(message masqué par la modération)",
    none: "Aucun échange.",
  },
  nl: {
    title: "De berichtendienst is verwijderd",
    message:
      "De interne berichtendienst is uit de toepassing verwijderd. De gesprekken van uw club worden na {date} definitief gewist. Wilt u ze bewaren, download ze dan als pdf met deze link (alleen voor het voorzitterschap).",
    pdfTitle: "Gesprekken van de berichtendienst: {club}",
    thread: "Gesprek: {subject}",
    hidden: "(bericht verborgen door de moderatie)",
    none: "Geen gesprekken.",
  },
  en: {
    title: "The messaging is retired",
    message:
      "The internal messaging has been removed from the application. Your club's exchanges will be deleted for good after {date}. To keep them, download them as a PDF with this link (for the presidency only).",
    pdfTitle: "Messaging exchanges: {club}",
    thread: "Conversation: {subject}",
    hidden: "(message hidden by moderation)",
    none: "No exchanges.",
  },
};
