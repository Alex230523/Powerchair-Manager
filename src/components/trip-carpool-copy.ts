import type { Locale } from "@/lib/locale";

/** Lot 4 (05/11/2026): seats offered by a parent or an adult player for a trip. */
type Copy = {
  title: string;
  intro: string;
  organiserIntro: string;
  seats: string;
  wheelchairPlaces: string;
  legs: string;
  legsOptions: Record<"both" | "out" | "back", string>;
  phone: string;
  note: string;
  offer: string;
  offered: string;
  withdraw: string;
  mine: string;
  statuses: Record<"offered" | "accepted", string>;
  none: string;
  accept: string;
  decline: string;
  placed: string;
  seatsOf: string;
};
const fr: Copy = {
  title: "Covoiturage",
  intro: "Vous avez de la place dans votre voiture ? Proposez-la : le club vous dit s'il la retient et y place les joueurs.",
  organiserIntro: "Les places proposées par les parents et les joueurs. Acceptée, la voiture rejoint les véhicules du déplacement : il reste à y placer les passagers.",
  seats: "Places (hors chauffeur)",
  wheelchairPlaces: "Fauteuils transportables",
  legs: "Trajet",
  legsOptions: { both: "Aller et retour", out: "Aller seulement", back: "Retour seulement" },
  phone: "Téléphone pour le jour même (facultatif)",
  note: "Précisions (facultatif)",
  offer: "Proposer ma voiture",
  offered: "Proposition envoyée : le club vous répondra.",
  withdraw: "Retirer ma proposition",
  mine: "Ma proposition",
  statuses: { offered: "En attente du club", accepted: "Retenue" },
  none: "Aucune place proposée pour l'instant.",
  accept: "Accepter",
  decline: "Refuser",
  placed: "Voiture ajoutée aux véhicules : placez les passagers.",
  seatsOf: "{seats} place(s), {chairs} fauteuil(s)",
};
const nl: Copy = {
  title: "Carpool",
  intro: "Hebt u plaats in uw auto? Bied ze aan: de club laat u weten of ze ze weerhoudt en plaatst er de spelers in.",
  organiserIntro: "De plaatsen aangeboden door ouders en spelers. Aanvaard, komt de auto bij de voertuigen van de verplaatsing: de passagiers zijn er nog in te plaatsen.",
  seats: "Plaatsen (zonder bestuurder)",
  wheelchairPlaces: "Rolstoelen die meekunnen",
  legs: "Rit",
  legsOptions: { both: "Heen en terug", out: "Enkel heen", back: "Enkel terug" },
  phone: "Telefoon voor de dag zelf (optioneel)",
  note: "Opmerkingen (optioneel)",
  offer: "Mijn auto aanbieden",
  offered: "Voorstel verstuurd: de club antwoordt u.",
  withdraw: "Mijn voorstel intrekken",
  mine: "Mijn voorstel",
  statuses: { offered: "Wacht op de club", accepted: "Weerhouden" },
  none: "Voorlopig geen plaatsen aangeboden.",
  accept: "Aanvaarden",
  decline: "Weigeren",
  placed: "Auto toegevoegd aan de voertuigen: plaats de passagiers.",
  seatsOf: "{seats} plaats(en), {chairs} rolstoel(en)",
};
const en: Copy = {
  title: "Carpooling",
  intro: "Room in your car? Offer it: the club tells you whether it takes it and places the players.",
  organiserIntro: "The seats offered by parents and players. Accepted, the car joins the trip's vehicles: the passengers remain to be placed.",
  seats: "Seats (driver excluded)",
  wheelchairPlaces: "Wheelchairs carried",
  legs: "Journey",
  legsOptions: { both: "There and back", out: "There only", back: "Back only" },
  phone: "Phone for the day (optional)",
  note: "Details (optional)",
  offer: "Offer my car",
  offered: "Offer sent: the club will answer.",
  withdraw: "Withdraw my offer",
  mine: "My offer",
  statuses: { offered: "Waiting for the club", accepted: "Taken" },
  none: "No seats offered yet.",
  accept: "Accept",
  decline: "Decline",
  placed: "Car added to the vehicles: place the passengers.",
  seatsOf: "{seats} seat(s), {chairs} wheelchair(s)",
};
export const tripCarpoolCopy: Record<Locale, Copy> = { fr, nl, en };
