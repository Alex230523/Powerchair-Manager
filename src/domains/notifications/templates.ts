import { z } from "zod";
export const editableKinds = [
  "invitation",
  "access_changed",
  "team_assignment",
  "family_access",
  "test_self",
  "registration_update",
  "document_update",
  "calendar_update",
  "attendance_update",
  "dues_reminder",
  "document_reminder",
  "training_update",
  "match_update",
  "registration_link",
  "license_update",
  "funding_task",
] as const;
/** Club-written mails: the text comes from the club, not from a template. */
export const clubWrittenKinds = ["club_newsletter", "event_mail"] as const;
/** Built by the platform from the person's own figures (wave 15, C7); not editable by the club. */
export const builtKinds = ["weekly_digest"] as const;
export const allKinds = [
  "auth_verify",
  "auth_reset",
  ...editableKinds,
  ...clubWrittenKinds,
  ...builtKinds,
] as const;
export type Kind = (typeof allKinds)[number];
export type Variables = {
  name: string;
  organization: string;
  url: string;
  role?: string;
  team?: string;
  /** Reminders: the player concerned, amounts due, documents expected. */
  person?: string;
  amount?: string;
  due?: string;
  details?: string;
  /** Coach courses. */
  course?: string;
  status?: string;
  /** Matches and referee designations. */
  match?: string;
  /** Club-written mails (newsletter, event mail): subject and text. */
  title?: string;
  message?: string;
};
export type Template = { subject: string; body: string };
export const builtin: Record<Kind, Record<"fr" | "nl" | "en", Template>> = {
  club_newsletter: {
    fr: {
      subject: "{title}",
      body: "{message}\n\n{organization}\nNe plus recevoir les nouvelles du club : {url}",
    },
    nl: {
      subject: "{title}",
      body: "{message}\n\n{organization}\nGeen clubnieuws meer ontvangen: {url}",
    },
    en: {
      subject: "{title}",
      body: "{message}\n\n{organization}\nStop receiving club news: {url}",
    },
  },
  // The digest's text already carries its links (dashboard, settings, stop).
  weekly_digest: {
    fr: { subject: "{title}", body: "{message}" },
    nl: { subject: "{title}", body: "{message}" },
    en: { subject: "{title}", body: "{message}" },
  },
  event_mail: {
    fr: { subject: "{title}", body: "{message}\n\n{organization}\n{url}" },
    nl: { subject: "{title}", body: "{message}\n\n{organization}\n{url}" },
    en: { subject: "{title}", body: "{message}\n\n{organization}\n{url}" },
  },
  dues_reminder: {
    fr: {
      subject: "Rappel de cotisation · {person}",
      body: "Bonjour {name},\nSauf erreur de notre part, la cotisation de {person} n’est pas encore en ordre.\nMontant : {amount}\nÉchéance : {due}\n{details}\nSi le paiement a déjà été fait, merci de ne pas tenir compte de ce message.\nSportivement,\n{organization}\n{url}",
    },
    nl: {
      subject: "Herinnering lidgeld · {person}",
      body: "Hallo {name},\nTenzij wij ons vergissen, is het lidgeld van {person} nog niet in orde.\nBedrag: {amount}\nVervaldag: {due}\n{details}\nAls de betaling al gebeurd is, mag u dit bericht negeren.\nSportieve groeten,\n{organization}\n{url}",
    },
    en: {
      subject: "Membership fee reminder · {person}",
      body: "Hello {name},\nUnless we are mistaken, the membership fee for {person} is not settled yet.\nAmount: {amount}\nDue: {due}\n{details}\nIf you have already paid, please ignore this message.\nKind regards,\n{organization}\n{url}",
    },
  },
  document_reminder: {
    fr: {
      subject: "Documents à fournir · {person}",
      body: "Bonjour {name},\nIl manque encore des documents pour {person} :\n{details}\nVous pouvez les déposer directement dans votre espace.\nMerci,\n{organization}\n{url}",
    },
    nl: {
      subject: "Ontbrekende documenten · {person}",
      body: "Hallo {name},\nEr ontbreken nog documenten voor {person}:\n{details}\nU kunt ze rechtstreeks in uw ruimte opladen.\nBedankt,\n{organization}\n{url}",
    },
    en: {
      subject: "Documents to provide · {person}",
      body: "Hello {name},\nSome documents are still missing for {person}:\n{details}\nYou can upload them directly in your space.\nThank you,\n{organization}\n{url}",
    },
  },
  registration_link: {
    fr: {
      subject: "Votre lien d'inscription · {organization}",
      body: "Bonjour {name},\nVoici votre lien personnel pour compléter et suivre votre inscription auprès de {organization}. Il est valable 30 jours ; ne le transmettez pas.\n{url}\nSi vous n'avez rien demandé, ignorez ce message.",
    },
    nl: {
      subject: "Uw inschrijvingslink · {organization}",
      body: "Hallo {name},\nHier is uw persoonlijke link om uw inschrijving bij {organization} aan te vullen en op te volgen. Hij blijft 30 dagen geldig; geef hem niet door.\n{url}\nHebt u niets aangevraagd, negeer dan dit bericht.",
    },
    en: {
      subject: "Your registration link · {organization}",
      body: "Hello {name},\nHere is your personal link to complete and follow your registration with {organization}. It is valid for 30 days; do not share it.\n{url}\nIf you did not ask for it, ignore this message.",
    },
  },
  license_update: {
    fr: {
      subject: "Licence · {person}",
      body: "Bonjour {name},\nLicence de {person} : {status}.\n{url}",
    },
    nl: {
      subject: "Licentie · {person}",
      body: "Hallo {name},\nLicentie van {person}: {status}.\n{url}",
    },
    en: {
      subject: "Licence · {person}",
      body: "Hello {name},\nLicence of {person}: {status}.\n{url}",
    },
  },
  funding_task: {
    fr: {
      subject: "À faire · {title}",
      body: "Bonjour {name},\nCette tâche vous est confiée pour {organization} : {title}.\nÉchéance : {due}.\n{url}",
    },
    nl: {
      subject: "Te doen · {title}",
      body: "Hallo {name},\nDeze taak is aan jou toevertrouwd voor {organization}: {title}.\nDeadline: {due}.\n{url}",
    },
    en: {
      subject: "To do · {title}",
      body: "Hello {name},\nThis task is yours for {organization}: {title}.\nDue: {due}.\n{url}",
    },
  },
  match_update: {
    fr: {
      subject: "Match · {match}",
      body: "Bonjour {name},\n{match} : {status}.\n{url}",
    },
    nl: {
      subject: "Wedstrijd · {match}",
      body: "Hallo {name},\n{match}: {status}.\n{url}",
    },
    en: {
      subject: "Match · {match}",
      body: "Hello {name},\n{match}: {status}.\n{url}",
    },
  },
  training_update: {
    fr: {
      subject: "Formation des coachs · {course}",
      body: "Bonjour {name},\nLa demande de formation « {course} » pour {person} : {status}.\n{url}",
    },
    nl: {
      subject: "Coachopleiding · {course}",
      body: "Hallo {name},\nDe opleidingsaanvraag « {course} » voor {person}: {status}.\n{url}",
    },
    en: {
      subject: "Coach education · {course}",
      body: "Hello {name},\nThe course request \u201c{course}\u201d for {person}: {status}.\n{url}",
    },
  },
  attendance_update: {
    en: {
      subject: "Invitations and attendance · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Convocations et présences · {organization}",
      body: "Bonjour {name},\nUne convocation, une relance ou une alerte d’effectif est disponible. Consultez les informations à jour.\n{url}",
    },
    nl: {
      subject: "Oproepen en aanwezigheid · {organization}",
      body: "Hallo {name},\nEen oproep, herinnering of bezettingsmelding staat klaar. Bekijk de actuele informatie.\n{url}",
    },
  },
  calendar_update: {
    en: {
      subject: "Calendar · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Calendrier · {organization}",
      body: "Bonjour {name},\nUn événement de votre calendrier a été créé ou modifié. Consultez les horaires et le lieu à jour.\n{url}",
    },
    nl: {
      subject: "Kalender · {organization}",
      body: "Hallo {name},\nEen evenement is aangemaakt of gewijzigd. Bekijk de actuele tijd en locatie.\n{url}",
    },
  },
  document_update: {
    en: {
      subject: "Documents · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Document · {organization}",
      body: "Bonjour {name},\nUne action concernant vos documents est disponible dans votre espace sécurisé.\n{url}",
    },
    nl: {
      subject: "Document · {organization}",
      body: "Hallo {name},\nEen actie voor uw documenten staat klaar in uw beveiligde omgeving.\n{url}",
    },
  },
  registration_update: {
    en: {
      subject: "Registration · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Inscription · {organization}",
      body: "Bonjour {name},\nVotre dossier d’inscription a été mis à jour. Consultez votre espace sécurisé.\n{url}",
    },
    nl: {
      subject: "Inschrijving · {organization}",
      body: "Hallo {name},\nUw inschrijvingsdossier is bijgewerkt. Bekijk uw beveiligde omgeving.\n{url}",
    },
  },
  auth_verify: {
    en: {
      subject: "Verify your email · PFM",
      body: "Hello {name},\nVerify your email address using this link. Ignore this message if you did not request it.\n{url}",
    },
    fr: {
      subject: "Vérification / Verificatie · PFM",
      body: "Bonjour {name},\nVérifiez votre adresse pour accéder à Powerchair Football Manager.\n{url}\nSi vous n’avez pas demandé cet accès, ignorez ce message.",
    },
    nl: {
      subject: "Verificatie · PFM",
      body: "Hallo {name},\nVerifieer uw adres voor Powerchair Football Manager.\n{url}\nNegeer dit bericht als u geen toegang hebt aangevraagd.",
    },
  },
  auth_reset: {
    en: {
      subject: "Reset your password · PFM",
      body: "Hello {name},\nUse this link to reset your password. It expires in one hour. Ignore this message if you did not request it.\n{url}",
    },
    fr: {
      subject: "Récupération / Herstel · PFM",
      body: "Bonjour {name},\nVous avez demandé à définir un nouveau mot de passe.\n{url}\nCe lien expire après une heure. Ignorez ce message si vous n’êtes pas à l’origine de cette demande.",
    },
    nl: {
      subject: "Herstel · PFM",
      body: "Hallo {name},\nU hebt een nieuw wachtwoord aangevraagd.\n{url}\nDeze link verloopt na één uur. Negeer dit bericht als u dit niet hebt aangevraagd.",
    },
  },
  invitation: {
    en: {
      subject: "Invitation · {organization}",
      body: "You are invited to {organization} as {role}. Use an account with this email address to accept the invitation. The link is valid for seven days.\n{url}",
    },
    fr: {
      subject: "Invitation · {organization}",
      body: "Vous êtes invité à rejoindre {organization} avec le rôle {role}.\nCréez ou utilisez un compte avec cette adresse, puis acceptez l’invitation.\n{url}\nLe lien est valable sept jours.",
    },
    nl: {
      subject: "Uitnodiging · {organization}",
      body: "U bent uitgenodigd voor {organization} als {role}.\nMaak of gebruik een account met dit adres en accepteer de uitnodiging.\n{url}\nDe link is zeven dagen geldig.",
    },
  },
  access_changed: {
    en: {
      subject: "Your access · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Vos accès · {organization}",
      body: "Vos accès dans {organization} ont été modifiés. Consultez vos mandats dans votre espace.\n{url}",
    },
    nl: {
      subject: "Uw toegang · {organization}",
      body: "Uw toegang tot {organization} is gewijzigd. Bekijk uw mandaten in uw werkruimte.\n{url}",
    },
  },
  team_assignment: {
    en: {
      subject: "Your team · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Votre équipe · {organization}",
      body: "Votre affectation à une équipe de {organization} a été modifiée. Consultez votre fiche pour les détails.\n{url}",
    },
    nl: {
      subject: "Uw team · {organization}",
      body: "Uw teamtoewijzing bij {organization} is gewijzigd. Bekijk uw dossier voor details.\n{url}",
    },
  },
  family_access: {
    en: {
      subject: "Family access · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Autorisation familiale · {organization}",
      body: "Une autorisation familiale vous concernant a été modifiée dans {organization}. Consultez les accès actuellement autorisés.\n{url}",
    },
    nl: {
      subject: "Familiemachtiging · {organization}",
      body: "Een familiemachtiging voor u bij {organization} is gewijzigd. Bekijk uw huidige toegangsrechten.\n{url}",
    },
  },
  test_self: {
    en: {
      subject: "Notification test · {organization}",
      body: "An update is available in your secure workspace for {organization}.\n{url}",
    },
    fr: {
      subject: "Test de notification · {organization}",
      body: "Bonjour {name},\nVotre test de notification pour {organization} a été enregistré.\n{url}",
    },
    nl: {
      subject: "Meldingstest · {organization}",
      body: "Hallo {name},\nUw meldingstest voor {organization} is opgeslagen.\n{url}",
    },
  },
};
const allowed: Record<Kind, string[]> = {
  club_newsletter: ["title", "message", "organization", "url"],
  event_mail: ["title", "message", "organization", "url"],
  weekly_digest: ["title", "message", "url"],
  attendance_update: ["name", "organization", "url"],
  dues_reminder: [
    "name",
    "organization",
    "url",
    "person",
    "amount",
    "due",
    "details",
  ],
  document_reminder: ["name", "organization", "url", "person", "details"],
  training_update: [
    "name",
    "organization",
    "url",
    "person",
    "course",
    "status",
  ],
  match_update: ["name", "organization", "url", "match", "status"],
  registration_link: ["name", "organization", "url"],
  license_update: ["name", "organization", "url", "person", "status"],
  funding_task: ["name", "organization", "url", "title", "due"],
  calendar_update: ["name", "organization", "url"],
  document_update: ["name", "organization", "url"],
  registration_update: ["name", "organization", "url"],
  auth_verify: ["name", "url"],
  auth_reset: ["name", "url"],
  invitation: ["organization", "role", "url"],
  access_changed: ["organization", "url"],
  team_assignment: ["organization", "url"],
  family_access: ["organization", "url"],
  test_self: ["name", "organization", "url"],
};
export function validateTemplate(kind: Kind, template: Template) {
  z.string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[^\r\n]+$/)
    .parse(template.subject);
  z.string().trim().min(5).max(5000).parse(template.body);
  const used = [
    ...(template.subject + "\n" + template.body).matchAll(/\{([^{}]+)\}/g),
  ].map((m) => m[1]);
  if (
    used.some((key) => !allowed[kind].includes(key)) ||
    /[{}]/.test(
      (template.subject + template.body).replace(/\{[^{}]+\}/g, ""),
    ) ||
    !template.body.includes("{url}")
  )
    throw new Error("INVALID_TEMPLATE");
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function renderTemplate(template: Template, variables: Variables) {
  const replace = (value: string) =>
    value.replace(/\{(\w+)\}/g, (_, key) =>
      String(variables[key as keyof Variables] ?? ""),
    );
  const subject = replace(template.subject)
      .replace(/[\r\n]/g, " ")
      .slice(0, 200),
    text = replace(template.body);
  const safeUrl = escapeHtml(variables.url);
  let html = escapeHtml(text).replaceAll("\n", "<br>");
  if (/^https?:\/\//.test(variables.url))
    html = html.split(safeUrl).join(`<a href="${safeUrl}">${safeUrl}</a>`);
  return {
    subject,
    text,
    html: "<!doctype html><html><body><p>" + html + "</p></body></html>",
  };
}
