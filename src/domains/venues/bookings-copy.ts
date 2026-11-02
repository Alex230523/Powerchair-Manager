import type { Locale } from "../../lib/locale";

/** 18: the words the server writes (slots, emails to the hall, tasks) in fr, nl, en. */
type Words = {
  at: string;
  weekly: string;
  once: string;
  subject: string;
  hello: string;
  ask: string;
  thanks: string;
  changeSubject: string;
  moved: string;
  cancelled: string;
  request: string;
  remind: string;
  pay: string;
  notify: string;
};
export const bookingWords: Record<Locale, Words> = {
  fr: {
    at: "{day} à {time}",
    weekly: "chaque {day} de {from} à {to}, du {first} au {last} ({n} séances)",
    once: "{day}, de {from} à {to}",
    subject: "Demande de réservation : {place} {season}",
    hello: "Bonjour {name},",
    ask: "Le club {club} souhaite réserver {place} pour la saison {season}, aux créneaux suivants :",
    thanks: "Pouvez-vous nous confirmer la réservation et nous indiquer sa référence ? Merci d'avance.",
    changeSubject: "Changement de créneau : {place}",
    moved: "La séance du {before} est déplacée au {after}.",
    cancelled: "La séance du {before} est annulée : la salle n'est pas nécessaire ce jour-là.",
    request: "Demander la réservation : {place}",
    remind: "Relancer la salle : {place}",
    pay: "Payer la facture : {place} ({period})",
    notify: "Prévenir la salle : {place}, séance du {when}",
  },
  nl: {
    at: "{day} om {time}",
    weekly: "elke {day} van {from} tot {to}, van {first} tot {last} ({n} sessies)",
    once: "{day}, van {from} tot {to}",
    subject: "Reservatieaanvraag: {place} {season}",
    hello: "Beste {name},",
    ask: "De club {club} wil {place} reserveren voor het seizoen {season}, op de volgende momenten:",
    thanks: "Kunt u de reservatie bevestigen en ons de referentie bezorgen? Alvast bedankt.",
    changeSubject: "Gewijzigd moment: {place}",
    moved: "De sessie van {before} wordt verplaatst naar {after}.",
    cancelled: "De sessie van {before} is geannuleerd: de zaal is die dag niet nodig.",
    request: "De reservatie aanvragen: {place}",
    remind: "De zaal opnieuw contacteren: {place}",
    pay: "De factuur betalen: {place} ({period})",
    notify: "De zaal verwittigen: {place}, sessie van {when}",
  },
  en: {
    at: "{day} at {time}",
    weekly: "every {day} from {from} to {to}, from {first} to {last} ({n} sessions)",
    once: "{day}, from {from} to {to}",
    subject: "Booking request: {place} {season}",
    hello: "Hello {name},",
    ask: "The club {club} would like to book {place} for the {season} season, at the following times:",
    thanks: "Could you confirm the booking and give us its reference? Thank you in advance.",
    changeSubject: "Change of slot: {place}",
    moved: "The session of {before} moves to {after}.",
    cancelled: "The session of {before} is cancelled: the hall is not needed that day.",
    request: "Request the booking: {place}",
    remind: "Follow up with the hall: {place}",
    pay: "Pay the invoice: {place} ({period})",
    notify: "Tell the hall: {place}, session of {when}",
  },
};
