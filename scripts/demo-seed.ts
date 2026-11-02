/**
 * Demo data for trying the application (Codespaces or local development).
 *
 *   npm run demo:seed
 *
 * Creates "Club démo Powerchair" with four ready-to-use accounts, a team,
 * trainings with call-ups, documents, dues and a pending application.
 * Business data goes through the real domain services (calendar, attendance,
 * documents, dues) so it obeys the same rules as the interface.
 *
 * Never run against a production database: the passwords below are public.
 */
import { Pool } from "pg";
import { seedTournaments } from "./demo-tournaments";
import { randomUUID } from "node:crypto";
import { createAuth } from "../src/lib/auth";
import { execute, type Principal } from "../src/domains/access/service";
import { calendarExecute } from "../src/domains/calendar/service";
import { tripExecute } from "../src/domains/trips/service";
import { venueExecute } from "../src/domains/venues/service";
import { fundraisingExecute } from "../src/domains/fundraising/service";
import { absenceExecute } from "../src/domains/absences/service";
import { attendanceExecute } from "../src/domains/attendance/service";
import {
  documentExecute,
  documentUpload,
} from "../src/domains/documents/service";
import { duesExecute } from "../src/domains/dues/service";
import { tasksExecute } from "../src/domains/tasks/service";
import { fundingExecute } from "../src/domains/funding/service";
import { fundingCommand } from "../src/domains/funding/schema";
import { contactsExecute } from "../src/domains/crm/service";
import { contactCommand } from "../src/domains/crm/schema";
import { automationsExecute } from "../src/domains/automations/service";
import { automationCommand } from "../src/domains/automations/schema";
import { taskCommand, yearTemplate, type YearKey } from "../src/domains/tasks/schema";
import { equipmentExecute } from "../src/domains/equipment/service";
import { playerProfileExecute } from "../src/domains/player-profile/service";
import { peopleExecute } from "../src/domains/people/service";
import { financeExecute } from "../src/domains/finance/service";
import { bankExecute } from "../src/domains/bank/service";
import { bankCommand } from "../src/domains/bank/schema";
import { detectBank, guessColumns, linesFromGrid, parseCamt, parseCoda, type StatementLine } from "../src/domains/bank/parse";
import { sampleCamt, sampleCoda, sampleCsv, sampleRows } from "../src/domains/bank/samples";
import { formatReference } from "../src/domains/bank/reference";
import { parseCsv, parseXlsx } from "../src/lib/spreadsheet";
import { xlsx } from "../src/lib/xlsx";
import {
  seasonOf,
  type categories,
  type methods,
} from "../src/domains/finance/schema";
import { coachExecute, coursesExecute } from "../src/domains/coaches/service";
import {
  matchExecute,
  designationExecute,
  refereeExecute,
} from "../src/domains/competitions/service";
import {
  clubLicensesExecute,
  federationLicensesExecute,
} from "../src/domains/federation/service";
import { platformTemplate } from "../src/domains/registrations/templates";
import { seal } from "../src/domains/notifications/crypto";

const CLUB = "Club démo Powerchair";
/**
 * Local and Codespaces demo: the public password below. An online preview
 * (Vercel) must use its own secret instead, PFM_DEMO_PASSWORD, which is
 * never printed.
 */
const ownPassword = process.env.PFM_DEMO_PASSWORD;
if (process.env.VERCEL_ENV && (!ownPassword || ownPassword.length < 12))
  throw new Error("PFM_DEMO_PASSWORD (12 characters minimum) is required for an online preview.");
export const DEMO_PASSWORD = ownPassword || "Demo-Powerchair-2026";
const accounts = [
  {
    key: "president",
    email: "president@demo.pfm",
    name: "Alex Martin",
    role: "club_president",
    profile: "Présidence · Club démo",
  },
  {
    key: "coach",
    email: "coach@demo.pfm",
    name: "Sam Leroy",
    role: "coach",
    profile: "Coach · Équipe A",
  },
  {
    key: "player",
    email: "joueur@demo.pfm",
    name: "Camille Dubois",
    role: "player",
    profile: "Joueuse · Club démo",
  },
  {
    key: "parent",
    email: "parent@demo.pfm",
    name: "Nadia Peeters",
    role: "guardian",
    profile: "Parent de Lucas",
  },
] as const;
type Key = (typeof accounts)[number]["key"];
const FEDERATION = "BPCF (démo)";
const federationAccount = {
  email: "federation@demo.pfm",
  name: "Marie Dupont",
  profile: "Présidence · BPCF (démo)",
};
const refereeAccount = {
  email: "arbitre@demo.pfm",
  name: "Jules Verhaegen",
  profile: "Arbitre · BPCF (démo)",
};

// Never in a Vercel production deployment. Elsewhere in production mode (a
// Vercel preview builds with NODE_ENV=production), only with the project's
// own secret password, never the public one written above.
if (process.env.VERCEL_ENV === "production")
  throw new Error("Refusing to create demo accounts in production.");
if (process.env.NODE_ENV === "production" && !ownPassword && !process.argv.includes("--force"))
  throw new Error("Refusing to create public demo accounts in production.");

const yearTitles: Record<YearKey, string> = {
  assembly: "Assemblée générale et approbation des comptes",
  filing: "Dépôt des comptes annuels",
  ubo: "Confirmation annuelle du registre UBO",
  tax: "Déclaration à l'impôt des personnes morales",
  insurance: "Renouvellement des assurances",
  affiliation: "Renouvellement de l'affiliation fédérale",
};
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const auth = createAuth(db);
const sessions: string[] = [];

async function principal(userId: string, mandateId: string): Promise<P> {
  const sessionId = randomUUID();
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 hour\')',
    [sessionId, userId, randomUUID()],
  );
  sessions.push(sessionId);
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
type P = Principal;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
// Next given weekday (0 = Sunday) strictly after today, as YYYY-MM-DD.
function next(weekday: number, extraWeeks = 0) {
  const d = new Date();
  d.setDate(
    d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7) + extraWeeks * 7,
  );
  return d.toISOString().slice(0, 10);
}
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

try {
  if (
    (await db.query("SELECT 1 FROM organization WHERE name=$1", [CLUB]))
      .rowCount
  ) {
    console.log(`« ${CLUB} » existe déjà.`);
    await alignPasswords();
    // Tournaments came later (21/10/2026): added to an existing demo once.
    await seedTournaments(db, CLUB, FEDERATION, refereeAccount.email);
    // Wave 16 (E1): the demo events take the club's type matching their kind.
    await db.query("UPDATE calendar_event e SET event_type_id=(SELECT t.id FROM event_type t WHERE t.organization_id=e.organization_id AND t.legacy_kind=e.kind ORDER BY t.position LIMIT 1) WHERE e.event_type_id IS NULL");
    printAccounts();
    await db.end();
    process.exit(0);
  }

  // 1. Accounts (Better Auth hashes the passwords and creates the person row).
  const users = {} as Record<Key, string>;
  for (const a of accounts) {
    const existing = (
      await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [a.email])
    ).rows[0];
    users[a.key] =
      existing?.id ??
      (
        await auth.api.signUpEmail({
          body: { email: a.email, name: a.name, password: DEMO_PASSWORD },
        })
      ).user.id;
  }

  // 2. Club, season, team, people (plain SQL: the same rows the people module writes).
  const org = (
    await db.query(
      "INSERT INTO organization(name,kind,contact_email) VALUES($1,'club','contact@demo.pfm') RETURNING id",
      [CLUB],
    )
  ).rows[0].id as string;
  const year =
    new Date().getMonth() >= 6
      ? new Date().getFullYear()
      : new Date().getFullYear() - 1;
  const season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id",
      [
        org,
        `${year}-${String(year + 1).slice(2)}`,
        `${year}-07-01`,
        `${year + 1}-06-30`,
      ],
    )
  ).rows[0].id as string;
  const team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name,category,level,home_location,color) VALUES($1,$2,'Équipe A','Powerchair','Championnat','Hall sportif du Parc','blue') RETURNING id",
      [org, season],
    )
  ).rows[0].id as string;
  // A second team: one club can run several teams in the same season.
  const teamB = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name,category,level,home_location,color) VALUES($1,$2,'Équipe B','Powerchair','Loisir','Hall sportif du Parc','amber') RETURNING id",
      [org, season],
    )
  ).rows[0].id as string;
  const mandates = {} as Record<Key, string>;
  for (const a of accounts) {
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, users[a.key]],
    );
    mandates[a.key] = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,team_id,created_by,grants) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          org,
          users[a.key],
          a.role,
          a.role === "coach" ? team : null,
          users.president,
          // The president also holds the explicit grants for confidential health data.
          a.role === "club_president"
            ? ["people.sensitive", "documents.sensitive"]
            : [],
        ],
      )
    ).rows[0].id;
    // A default saved profile: after signing in, the account lands directly in the club.
    await db.query(
      "INSERT INTO user_profile(user_id,mandate_id,name,is_default) VALUES($1,$2,$3,true)",
      [users[a.key], mandates[a.key], a.profile],
    );
  }
  async function member(
    name: string,
    birth: string,
    roles: string[],
    userId: string | null,
    extra: { position?: string; jersey?: number } = {},
  ) {
    const person = userId
      ? (await db.query("SELECT id FROM person WHERE user_id=$1", [userId]))
          .rows[0].id
      : (
          await db.query(
            "INSERT INTO person(user_id) VALUES(NULL) RETURNING id",
          )
        ).rows[0].id;
    return (
      await db.query(
        "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,joined_on,directory_roles,playing_position,jersey_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          org,
          person,
          name,
          birth,
          `${year - 2}-09-01`,
          roles,
          extra.position ?? "",
          extra.jersey ?? null,
        ],
      )
    ).rows[0].id as string;
  }
  const people = {
    president: await member("Alex Martin", "1979-03-14", [], users.president),
    coach: await member("Sam Leroy", "1986-11-02", ["coach"], users.coach),
    camille: await member(
      "Camille Dubois",
      "2001-06-21",
      ["player"],
      users.player,
      { position: "Attaquante", jersey: 7 },
    ),
    nadia: await member("Nadia Peeters", "1982-01-09", [], users.parent),
    lucas: await member("Lucas Peeters", "2013-04-30", ["player"], null, {
      position: "Défenseur",
      jersey: 4,
    }),
    yanis: await member("Yanis El Amrani", "2005-09-17", ["player"], null, {
      position: "Gardien",
      jersey: 1,
    }),
    emma: await member("Emma Janssens", "2010-12-03", ["player"], null, {
      position: "Défenseuse",
      jersey: 9,
    }),
    thomas: await member("Thomas Wouters", "1998-02-26", ["player"], null, {
      position: "Attaquant",
      jersey: 11,
    }),
  };
  const players = [
    people.camille,
    people.lucas,
    people.yanis,
    people.emma,
    people.thomas,
  ];
  for (const id of players)
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',$4)",
      [org, team, id, `${year}-07-01`],
    );
  await db.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',$4)",
    [org, team, people.coach, `${year}-07-01`],
  );
  // Two earlier seasons, so the headcount chart and the retention rate have a history (wave 15).
  for (const [back, who] of [
    [2, [people.camille, people.yanis, people.thomas]],
    [1, [people.camille, people.yanis, people.thomas, people.emma]],
  ] as const) {
    const past = (
      await db.query(
        "INSERT INTO season(organization_id,name,starts_on,ends_on,archived) VALUES($1,$2,$3,$4,true) RETURNING id",
        [org, `${year - back}-${String(year - back + 1).slice(2)}`, `${year - back}-07-01`, `${year - back + 1}-06-30`],
      )
    ).rows[0].id as string;
    const pastTeam = (
      await db.query(
        "INSERT INTO team(organization_id,season_id,name,category,level,home_location,color,archived) VALUES($1,$2,'Équipe A','Powerchair','Championnat','Hall sportif du Parc','blue',true) RETURNING id",
        [org, past],
      )
    ).rows[0].id as string;
    for (const id of who)
      await db.query(
        "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on,ends_on) VALUES($1,$2,$3,'player',$4,$5)",
        [org, pastTeam, id, `${year - back}-07-01`, `${year - back + 1}-06-30`],
      );
  }
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,starts_on,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,$4,'Données de démonstration',$5)",
    [org, people.nadia, people.lucas, `${year}-07-01`, users.president],
  );

  const president = await principal(users.president, mandates.president);

  // 3. Calendar: a venue, a weekly training series and a friendly match.
  await calendarExecute(
    db,
    president,
    {
      action: "place",
      name: "Hall sportif du Parc",
      address: "Rue du Parc 12, 1080 Bruxelles",
      contact: "Accueil du hall",
      capacity: 40,
      costCents: 0,
      accessible: true,
      toilets: true,
      parking: true,
      storage: true,
      charging: true,
      logistics: "Recharge des fauteuils possible dans le local matériel.",
      archived: false,
    },
    org,
  );
  const place = (
    await db.query("SELECT id FROM calendar_place WHERE organization_id=$1", [
      org,
    ])
  ).rows[0].id as string;
  const event = (
    title: string,
    kind: "training" | "friendly" | "meeting",
    date: string,
    from: string,
    to: string,
    occurrences = 1,
  ) =>
    calendarExecute(
      db,
      president,
      {
        action: "create",
        title,
        kind,
        customType: "",
        timezone: "Europe/Brussels",
        localStart: `${date}T${from}`,
        localEnd: `${date}T${to}`,
        fold: "reject",
        teamId: kind === "meeting" ? null : team,
        placeId: kind === "meeting" ? null : place,
        freeLocation: kind === "meeting" ? "Club house" : undefined,
        responsibleId: kind === "meeting" ? users.president : users.coach,
        visibility: kind === "meeting" ? "organization" : "team",
        equipment:
          kind === "training" ? "Fauteuil chargé, ballon, protections" : "",
        instructions: kind === "training" ? "Échauffement à 18:15." : "",
        participants: [],
        documents: [],
        intervalDays: occurrences > 1 ? 7 : 0,
        occurrences,
        requestId: randomUUID(),
      },
      org,
    );
  const training = await event(
    "Entraînement Équipe A",
    "training",
    next(2),
    "18:30",
    "20:30",
    8,
  );
  const friendly = await event(
    "Match amical contre Liège",
    "friendly",
    next(6),
    "14:00",
    "16:00",
  );
  await event(
    "Assemblée générale du club",
    "meeting",
    next(0, 1),
    "10:00",
    "12:00",
  );

  // 4. Call-ups: the next training and the friendly match.
  for (const [eventId, hoursBefore] of [
    [training.id, 6],
    [friendly.id, 24],
  ] as const) {
    const starts = (
      await db.query("SELECT starts_at FROM calendar_event WHERE id=$1", [
        eventId,
      ])
    ).rows[0].starts_at as Date;
    await attendanceExecute(
      db,
      president,
      {
        action: "invite",
        eventId,
        expectedVersion: null,
        profiles: players,
        deadline: new Date(
          starts.getTime() - hoursBefore * 3600_000,
        ).toISOString(),
        minimum: 4,
      },
      org,
    );
  }
  // A finished training whose register was never closed (shows in the president's to-do list).
  const series = randomUUID();
  await db.query(
    "INSERT INTO calendar_series(id,organization_id,interval_days,occurrences,created_by) VALUES($1,$2,0,1,$3)",
    [series, org, users.president],
  );
  const past = (
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility)
       SELECT $1,$2,1,'Entraînement Équipe A','training','Europe/Brussels',s,s+interval '2 hours',
              to_char(s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$3,$4,$5,'team'
         FROM (SELECT ((CURRENT_DATE-3)+time '18:30') AT TIME ZONE 'Europe/Brussels' AS s) t RETURNING id`,
      [org, series, team, place, users.coach],
    )
  ).rows[0].id;
  const register = (
    await db.query(
      "INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()-interval '4 days') RETURNING id",
      [org, past],
    )
  ).rows[0].id;
  for (const id of players)
    await db.query(
      "INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response) VALUES($1,$2,$3,'present')",
      [org, register, id],
    );

  // Earlier sessions with closed registers, so profiles and statistics have history.
  const history: [
    number,
    string,
    "training" | "friendly",
    Record<string, [string, string]>,
  ][] = [
    [
      10,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "present"],
        lucas: ["present", "late"],
        yanis: ["absent", "absent"],
        emma: ["present", "present"],
        thomas: ["present", "present"],
      },
    ],
    [
      13,
      "Match amical contre Namur",
      "friendly",
      {
        camille: ["present", "present"],
        lucas: ["present", "present"],
        yanis: ["present", "present"],
        emma: ["uncertain", "absent"],
        thomas: ["present", "present"],
      },
    ],
    [
      17,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "present"],
        lucas: ["absent", "absent"],
        yanis: ["present", "present"],
        emma: ["present", "early"],
        thomas: ["none", "absent"],
      },
    ],
    [
      24,
      "Entraînement Équipe A",
      "training",
      {
        camille: ["present", "late"],
        lucas: ["present", "present"],
        yanis: ["present", "present"],
        emma: ["present", "present"],
        thomas: ["present", "present"],
      },
    ],
  ];
  const key = {
    camille: people.camille,
    lucas: people.lucas,
    yanis: people.yanis,
    emma: people.emma,
    thomas: people.thomas,
  } as Record<string, string>;
  for (const [daysAgo, title, kind, results] of history) {
    const s = randomUUID();
    await db.query(
      "INSERT INTO calendar_series(id,organization_id,interval_days,occurrences,created_by) VALUES($1,$2,0,1,$3)",
      [s, org, users.president],
    );
    const eventId = (
      await db.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility)
         SELECT $1,$2,1,$3,$4,'Europe/Brussels',t.s,t.s+interval '2 hours',
                to_char(t.s AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char((t.s+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),$5,$6,$7,'team'
           FROM (SELECT ((CURRENT_DATE-$8::int)+time '18:30') AT TIME ZONE 'Europe/Brussels' AS s) t RETURNING id`,
        [org, s, title, kind, team, place, users.coach, daysAgo],
      )
    ).rows[0].id;
    const reg = (
      await db.query(
        "INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now()-($3::int||' days')::interval,now()-(($3::int-1)||' days')::interval,$4) RETURNING id",
        [org, eventId, daysAgo, users.coach],
      )
    ).rows[0].id;
    for (const [who, [response, actual]] of Object.entries(results))
      await db.query(
        "INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,$4,$5)",
        [org, reg, key[who], response, actual],
      );
  }

  // 5. Documents: one to verify, one expired, pieces still expected from families.
  const request = (
    profileId: string,
    name: string,
    category: "identity" | "licence" | "consent" | "insurance",
  ) =>
    documentExecute(
      db,
      president,
      {
        action: "request",
        profileId,
        seasonId: season,
        name,
        category,
        sensitive: false,
      },
      org,
    );
  await request(people.camille, "Carte d’identité", "identity");
  await request(people.camille, `Licence ${year}-${year + 1}`, "licence");
  await request(people.lucas, "Autorisation parentale", "consent");
  await request(people.yanis, "Attestation d’assurance", "insurance");
  // A template-generated authorisation that Lucas's mother can sign electronically.
  const authorisation = await documentExecute(
    db,
    president,
    {
      action: "template",
      name: "Autorisation parentale",
      locale: "fr",
      body: "Je soussigné(e), représentant légal de {name}, autorise {organization} à l'inscrire aux entraînements, matchs et déplacements de la saison {season}, et à prendre les mesures urgentes nécessaires en cas d'accident.\nFait le {date}.",
      expectedVersion: 0,
    },
    org,
  );
  const consent = (
    await db.query(
      "SELECT id,version FROM club_document WHERE organization_id=$1 AND name='Autorisation parentale'",
      [org],
    )
  ).rows[0];
  await documentExecute(
    db,
    president,
    {
      action: "generate",
      id: consent.id,
      templateId: authorisation.id,
      expectedVersion: consent.version,
    },
    org,
  );
  for (const name of ["Carte d’identité", "Attestation d’assurance"]) {
    const doc = (
      await db.query(
        "SELECT id,version FROM club_document WHERE organization_id=$1 AND name=$2",
        [org, name],
      )
    ).rows[0];
    await documentUpload(
      db,
      president,
      doc.id,
      doc.version,
      { name: "exemple.pdf", type: "application/pdf", bytes: pdf },
      org,
    );
  }
  await db.query(
    "UPDATE club_document SET status='valid',expires_on=CURRENT_DATE-3,version=version+1 WHERE organization_id=$1 AND name='Attestation d’assurance'",
    [org],
  );

  // 6. Dues: a 250 EUR rate payable in four instalments.
  const plan = await duesExecute(
    db,
    president,
    {
      action: "plan",
      seasonId: season,
      category: "Cotisation joueur",
      amountCents: 25000,
      maxInstallments: 4,
      firstDue: day(10),
    },
    org,
  );
  // A3: the rate is issued by itself when a registration is accepted.
  await duesExecute(db, president, { action: "autoIssue", planId: plan.id as string }, org);
  for (const profileId of [people.camille, people.lucas])
    await duesExecute(
      db,
      president,
      {
        action: "issue",
        planId: plan.id,
        profileId,
        discountCents: 0,
        reason: "",
        installments: 4,
        firstDue: day(10),
      },
      org,
    );

  // A1: the central to-do. The yearly duties of the ASBL, a few tasks of the club, one for the coach.
  const thisYear = Number(day(0).slice(0, 4));
  await tasksExecute(
    db,
    president,
    taskCommand.parse({
      action: "applyYear",
      year: thisYear,
      items: yearTemplate("01-01", thisYear).map((i) => ({ key: i.key, title: yearTitles[i.key], dueOn: i.dueOn, responsibleId: i.key === "affiliation" ? people.president : null })),
    }),
    org,
  );
  for (const task of [
    { category: "sport", title: "Inscrire l'équipe au tournoi de printemps", dueOn: day(12), responsibleId: people.coach, priority: "high", checklist: ["Choisir les joueurs", "Payer l'inscription"] },
    { category: "events", title: "Réserver la salle pour la fête du club", dueOn: day(25), responsibleId: people.president, checklist: [] },
    { category: "fundraising", title: "Préparer la vente de gaufres", dueOn: day(5), responsibleId: null, recurrence: "yearly", checklist: ["Commander la pâte", "Trouver deux bénévoles"] },
    { category: "admin", title: "Mettre à jour le registre des membres", dueOn: day(-2), responsibleId: people.president, checklist: [] },
  ])
    await tasksExecute(db, president, taskCommand.parse({ action: "create", ...task }), org);

  // A2: « Subsides & sponsors »: a grant paid in two instalments, a call that opens soon, a sponsor to call back.
  const fund = (cmd: Record<string, unknown>) => fundingExecute(db, president, fundingCommand.parse(cmd), org) as Promise<{ id: string }>;
  const region = await fund({
    action: "grant",
    funder: "Région (démo)",
    program: "Sport adapté",
    purpose: "Deux fauteuils de sport",
    requestedCents: 800000,
    grantedCents: 600000,
    status: "granted",
    notes: "",
    opensOn: day(-120),
    deadlineOn: day(-60),
    startsOn: day(-30),
    endsOn: day(335),
    reportDueOn: day(300),
  });
  await fund({ action: "grantPayment", grantId: region.id, receivedOn: day(-20), amountCents: 360000, note: "Première tranche" });
  await fund({ action: "grant", funder: "Commune (démo)", program: "Clubs inclusifs", purpose: "Transport vers les tournois", requestedCents: 150000, status: "idea", notes: "", opensOn: day(10), deadlineOn: day(45) });
  await fund({
    action: "partner",
    name: "Garage démo",
    kind: "sponsor",
    status: "active",
    amountCents: 150000,
    inKind: "",
    counterpart: "Logo sur les maillots",
    startsOn: day(-200),
    endsOn: day(40),
    nextAction: "Proposer le renouvellement",
    notes: "",
    signedOn: day(-200),
    responsibleId: people.president,
    lastContactOn: day(-95),
  });

  // A4: the contact book as a CRM: an organisation, a log, a next action, a sponsor's contact.
  const crm = (cmd: Record<string, unknown>) => contactsExecute(db, president, contactCommand.parse(cmd), org) as Promise<{ id: string }>;
  const alderman = await crm({ action: "contact", fullName: "Claire Échevine (démo)", organizationName: "Commune (démo)", role: "Échevine des sports", email: "", phone: "", tags: ["public"], notes: "" });
  await crm({ action: "interaction", contactId: alderman.id, kind: "meeting", summary: "Présentation du projet de fauteuils", happenedOn: day(-40) });
  await crm({ action: "interaction", contactId: alderman.id, kind: "call", summary: "L'appel à projets ouvre bientôt", happenedOn: day(-5) });
  await crm({ action: "nextAction", contactId: alderman.id, title: "Envoyer le budget prévisionnel", dueOn: day(8), responsibleId: people.president });
  const garage = await crm({ action: "contact", fullName: "Marc Garage (démo)", organizationName: "Garage démo", role: "Gérant", email: "", phone: "", tags: ["sponsor"], notes: "" });
  await crm({ action: "interaction", contactId: garage.id, kind: "note", summary: "Préfère être appelé le matin" });

  // B7: two automations switched on for the demo club (nothing leaves while mails stay local).
  for (const rule of ["documentExpiring", "sponsorQuiet"] as const)
    await automationsExecute(db, president, automationCommand.parse({ action: "rule", rule, enabled: true, paused: false, delayDays: rule === "documentExpiring" ? 30 : 90, actions: ["notify", "email"] }), org);

  // 7. Equipment: club chairs (one shared), a player's own chair, a loan chair in repair.
  const chair = async (input: {
    name: string;
    ownership: "club" | "player" | "loan";
    status: "available" | "maintenance";
    speed: number;
    last: string | null;
    next: string | null;
    notes?: string;
  }) =>
    (
      await equipmentExecute(
        db,
        president,
        {
          action: "chair",
          name: input.name,
          brand: "Démo Sport",
          model: "Pivot 10",
          // Wave 17 (Q1): a model is required; this one waits for the federation.
          modelId: null,
          newModel: { brand: "Démo Sport", name: "Pivot 10" },
          serialNumber:
            "DEMO-" + input.name.replace(/\D/g, "").padStart(3, "0"),
          ownership: input.ownership,
          status: input.status,
          maxSpeedKmh: input.speed,
          battery: "2 × 12 V, 73 Ah (gel)",
          acquiredOn: `${year - 2}-09-01`,
          lastServiceOn: input.last,
          nextServiceOn: input.next,
          notes: input.notes ?? "",
        },
        org,
      )
    ).id;
  const club1 = await chair({
    name: "Fauteuil club n°1",
    ownership: "club",
    status: "available",
    speed: 10,
    last: day(-90),
    next: day(90),
  });
  const club2 = await chair({
    name: "Fauteuil club n°2",
    ownership: "club",
    status: "available",
    speed: 10,
    last: day(-170),
    next: day(7),
  });
  const own = await chair({
    name: "Fauteuil de Camille",
    ownership: "player",
    status: "available",
    speed: 10,
    last: day(-30),
    next: day(150),
  });
  await chair({
    name: "Fauteuil de prêt",
    ownership: "loan",
    status: "maintenance",
    speed: 11,
    last: day(-200),
    next: null,
    notes: "Contrôleur à recalibrer : 11 km/h mesurés.",
  });
  for (const [chairId, profileId, primary] of [
    [club1, people.yanis, true],
    [club1, people.thomas, false],
    [club2, people.lucas, true],
    [own, people.camille, true],
    [club2, people.emma, true],
  ] as const)
    await equipmentExecute(
      db,
      president,
      {
        action: "assign",
        chairId,
        profileId,
        primary,
        startsOn: `${year}-09-01`,
      },
      org,
    );

  // 8. Player profiles: sport class, chair control, support needs and confidential notes (fictitious).
  const profiles: [
    string,
    "PF1" | "PF2" | "pending",
    "right_hand" | "left_hand" | "chin",
    string,
    string,
    string,
    string,
    string,
  ][] = [
    [
      people.camille,
      "PF2",
      "right_hand",
      "Finition rapide, bonne lecture du jeu. Capitaine.",
      "Autonome pour les transferts. Prévoir 10 minutes pour installer les sangles.",
      "Sangle de cuisse obligatoire en match.",
      "Marc Dubois (frère) · +32 470 00 00 01",
      "Myopathie (donnée fictive de démonstration)",
    ],
    [
      people.lucas,
      "PF1",
      "chin",
      "Très bon placement défensif. Travailler les passes longues.",
      "Transfert avec l’aide d’un adulte formé. Communication : laisser le temps de répondre.",
      "Ceinture pectorale. Pauses hydratation toutes les 20 minutes.",
      "Nadia Peeters (mère) · +32 470 00 00 02",
      "Amyotrophie spinale (donnée fictive de démonstration)",
    ],
    [
      people.yanis,
      "PF1",
      "left_hand",
      "Gardien titulaire, excellent sur les tirs de près.",
      "",
      "",
      "",
      "",
    ],
    [
      people.emma,
      "pending",
      "right_hand",
      "Nouvelle venue, classification demandée à la fédération.",
      "",
      "",
      "",
      "",
    ],
    [
      people.thomas,
      "PF2",
      "right_hand",
      "Attaquant de soutien, polyvalent.",
      "",
      "",
      "",
      "",
    ],
  ];
  for (const [
    id,
    classification,
    control,
    notes,
    needs,
    safety,
    emergency,
    impairment,
  ] of profiles) {
    await playerProfileExecute(
      db,
      president,
      {
        action: "sport",
        id,
        version: 0,
        classification,
        classificationValidUntil:
          classification === "pending" ? null : `${year + 2}-06-30`,
        control,
        sportNotes: notes,
      },
      org,
    );
    if (!needs) continue;
    await playerProfileExecute(
      db,
      president,
      {
        action: "support",
        id,
        version: 0,
        supportNeeds: needs,
        safetyNotes: safety,
        emergencyContact: emergency,
      },
      org,
    );
    await playerProfileExecute(
      db,
      president,
      {
        action: "confidential",
        id,
        version: 1,
        impairment,
        medicalNotes: "Aucune allergie connue (donnée fictive).",
      },
      org,
    );
  }

  // 9. A submitted application waiting for the club's decision.
  const template = platformTemplate("player", "fr");
  const form = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title,description,fields,published) VALUES($1,$2,$3,$4,$5,true) RETURNING id",
      [
        org,
        season,
        template.title,
        template.description,
        JSON.stringify(template.fields),
      ],
    )
  ).rows[0].id;
  const application = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_kind,subject_name,birth_date,locale,form_snapshot,answers,status,submitted_at) VALUES($1,$2,$3,$4,'represented','Inès Peeters','2015-08-12','fr',$5,$6,'submitted',now()) RETURNING id",
      [
        org,
        form,
        users.parent,
        season,
        JSON.stringify({ title: template.title, fields: template.fields }),
        JSON.stringify({
          gender: ["Femme"],
          address: "Rue de la Démo 12",
          postal_code: "1030",
          email: "parent@demo.pfm",
          phone: "+32 470 12 34 56",
          emergency: "Nadia Peeters, mère, +32 470 65 43 21",
          heard_about: ["École, centre ou kiné", "Réseaux sociaux"],
          jersey_size: "Enfant 12-14 ans",
          jersey_number: "8",
          joystick: ["Main droite"],
          photo_consent: true,
          installments: "4 fois",
          privacy_consent: true,
        }),
      ],
    )
  ).rows[0].id;
  // Confidential answers are stored encrypted, exactly as the service does.
  await db.query(
    "UPDATE registration_application SET confidential_answers=$2 WHERE id=$1",
    [
      application,
      seal(
        {
          condition:
            "Amyotrophie spinale de type 2 (donnée fictive de démonstration).",
        },
        "registration:" + application,
      ),
    ],
  );
  await db.query(
    "INSERT INTO registration_history(application_id,actor_id,status) VALUES($1,$2,'submitted')",
    [application, users.parent],
  );

  // 10. The president also coaches Équipe B: same profile, no duplicate.
  await peopleExecute(
    db,
    president,
    { action: "selfCoach", teamId: teamB },
    org,
  );

  // 11. Club ledger: a season of income and expenses.
  type Category = (typeof categories)[number];
  type Method = (typeof methods)[number];
  const ledger: [number, string, "in" | "out", Category, number, Method][] = [
    [-80, "Subside communal sport adapté", "in", "subsidy", 150000, "transfer"],
    [-65, "Sponsor maillots", "in", "sponsor", 80000, "transfer"],
    [-50, "Location salle (trimestre)", "out", "venue", 45000, "transfer"],
    [-42, "Pneus et batteries", "out", "equipment", 32000, "card"],
    [
      -30,
      "Cotisations reçues (lot septembre)",
      "in",
      "dues",
      125000,
      "transfer",
    ],
    [-21, "Déplacement tournoi Gand", "out", "travel", 18500, "card"],
    [-14, "Inscription championnat", "out", "competition", 25000, "transfer"],
    [-7, "Tombola fête du club", "in", "event", 42000, "cash"],
    [-3, "Assurance saison", "out", "insurance", 38000, "transfer"],
  ];
  for (const [
    offset,
    label,
    direction,
    category,
    amountCents,
    method,
  ] of ledger)
    await financeExecute(
      db,
      president,
      {
        action: "record",
        occurredOn: day(offset),
        label,
        direction,
        category,
        amountCents,
        method,
        counterparty: "",
        reference: "",
        notes: "Donnée de démonstration.",
      },
      org,
    );

  // Camille paid her first instalment: the ledger line is linked to her dues,
  // so she is no longer reminded for that amount.
  const camilleDues = (
    await db.query(
      "SELECT id FROM dues_receivable WHERE organization_id=$1 AND profile_id=$2 AND status='open'",
      [org, people.camille],
    )
  ).rows[0].id as string;
  await financeExecute(
    db,
    president,
    {
      action: "record",
      occurredOn: day(-2),
      label: "Cotisation Camille Dubois (1/4)",
      direction: "in",
      category: "dues",
      amountCents: 6250,
      method: "transfer",
      counterparty: "Camille Dubois",
      reference: "",
      notes: "",
      receivableId: camilleDues,
    },
    org,
  );
  // B1 (lot 09): the dues account and one statement of each format (CSV of
  // Belfius, Excel of KBC, CODA, camt.053), written as each bank writes it
  // and read back by the parsers of the « Relevés » page. A transfer with
  // its structured communication files itself; the others wait for a person.
  await bankExecute(db, president, bankCommand.parse({ action: "account", label: "Compte courant", iban: "BE68539007547034", bic: "GKCCBEBB", forDues: true }), org);
  const fees = (
    await db.query(
      `SELECT cp.full_name,d.reference,(SELECT json_agg(json_build_object('reference',i.reference,'cents',i.amount_cents) ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id) AS parts
         FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.organization_id=$1 AND d.status='open' ORDER BY cp.full_name LIMIT 4`,
      [org],
    )
  ).rows as { full_name: string; reference: string; parts: { reference: string; cents: number }[] | null }[];
  const iban = "BE68539007547034";
  const move = (offset: number, cents: number, who: string, communication: string, ref: string): StatementLine => ({
    bookedOn: day(offset),
    amountCents: cents,
    counterparty: who.toUpperCase(),
    counterpartyIban: "BE71096123456769",
    communication,
    bankRef: ref,
  });
  const second = (f: (typeof fees)[number]) => f.parts?.[1] ?? f.parts?.[0] ?? { reference: f.reference, cents: 5000 };
  const statements: { format: "csv" | "xlsx" | "coda" | "camt"; bank: "belfius" | "kbc" | "other"; filename: string; lines: StatementLine[] }[] = [];
  if (fees.length) {
    const [a, b = fees[0], c = fees[0], d = fees[0]] = fees;
    const belfius = [move(-9, second(a).cents, a.full_name, formatReference(second(a).reference), "DEMO-BEL-1"), move(-9, -4200, "Sport Shop Wavre", "Chasubles", "DEMO-BEL-2")];
    const grid = parseCsv(sampleCsv("belfius", iban, belfius));
    statements.push({ format: "csv", bank: detectBank(grid[0]) as "belfius", filename: "belfius.csv", lines: linesFromGrid(grid, guessColumns(grid[0])).lines });
    const book = xlsx(sampleRows("kbc", iban, [move(-7, 10000, `Famille ${b.full_name.split(" ").pop()}`, "cotisation", "DEMO-KBC-1")]));
    const sheet = await parseXlsx(book.buffer.slice(book.byteOffset, book.byteOffset + book.byteLength) as ArrayBuffer);
    statements.push({ format: "xlsx", bank: detectBank(sheet[0]) as "kbc", filename: "kbc.xlsx", lines: linesFromGrid(sheet, guessColumns(sheet[0])).lines });
    statements.push({ format: "coda", bank: "other", filename: "releve.cod", lines: parseCoda(sampleCoda(iban, [move(-5, second(c).cents, c.full_name, formatReference(second(c).reference), "DEMO-CODA-1")])).lines });
    statements.push({ format: "camt", bank: "other", filename: "releve.xml", lines: parseCamt(sampleCamt(iban, [move(-3, 2500, d.full_name, "Souper spaghetti", "DEMO-CAMT-1")])).lines });
  }
  for (const st of statements) await bankExecute(db, president, bankCommand.parse({ action: "import", ...st }), org);

  // Season budget, compared with actuals on the funding page.
  const season0 = seasonOf(day(0)).label;
  await financeExecute(
    db,
    president,
    {
      action: "budget",
      season: season0,
      lines: [
        { direction: "in", category: "dues", amountCents: 250000 },
        { direction: "in", category: "subsidy", amountCents: 150000 },
        { direction: "in", category: "sponsor", amountCents: 100000 },
        { direction: "in", category: "event", amountCents: 60000 },
        { direction: "out", category: "venue", amountCents: 180000 },
        { direction: "out", category: "equipment", amountCents: 80000 },
        { direction: "out", category: "travel", amountCents: 60000 },
        { direction: "out", category: "competition", amountCents: 50000 },
        { direction: "out", category: "insurance", amountCents: 40000 },
      ],
    },
    org,
  );
  // A probable duplicate (created by hand without birth date) to try the merge.
  const spare = (
    await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")
  ).rows[0].id;
  await db.query(
    "INSERT INTO club_person(organization_id,person_id,full_name,phone,directory_roles) VALUES($1,$2,'Yanis El Amrani','+32 470 22 33 44','{player}')",
    [org, spare],
  );

  // 12. Federation: course catalogue, a club request and a decision.
  const fedUser =
    (
      await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [
        federationAccount.email,
      ])
    ).rows[0]?.id ??
    (
      await auth.api.signUpEmail({
        body: {
          email: federationAccount.email,
          name: federationAccount.name,
          password: DEMO_PASSWORD,
        },
      })
    ).user.id;
  const federation = (
    await db.query(
      "INSERT INTO organization(name,kind,contact_email) VALUES($1,'federation','federation@demo.pfm') RETURNING id",
      [FEDERATION],
    )
  ).rows[0].id as string;
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [federation, fedUser],
  );
  // The demo club is affiliated with the BPCF: its coaches see the federation's courses.
  // Wave 16 (I3): its affiliation number, shown in « Clubs et présidents ».
  await db.query("UPDATE organization SET federation_id=$1,affiliation_number='BPCF-001',legal_form='asbl' WHERE id=$2", [
    federation,
    org,
  ]);
  const fedMandate = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,created_by) VALUES($1,$2,'federation_president',$2) RETURNING id",
      [federation, fedUser],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO user_profile(user_id,mandate_id,name,is_default) VALUES($1,$2,$3,true)",
    [fedUser, fedMandate, federationAccount.profile],
  );
  const fed = await principal(fedUser, fedMandate);
  const courses: Record<string, string> = {};
  for (const [title, level, hours, validity, description] of [
    [
      "Initiateur powerchair football",
      "Niveau 1",
      16,
      null,
      "Bases de l'encadrement, sécurité et règles du jeu.",
    ],
    [
      "Coach powerchair football",
      "Niveau 2",
      40,
      5,
      "Tactique, planification de saison et gestion d'équipe.",
    ],
    [
      "Premiers secours sport adapté",
      "Recyclage",
      8,
      3,
      "Gestes de premiers secours et transferts en sécurité.",
    ],
  ] as const)
    courses[title] = (
      await coursesExecute(
        db,
        fed,
        {
          action: "createCourse",
          title,
          level,
          description,
          hours,
          validityYears: validity,
        },
        federation,
      )
    ).id;
  const firstRequest = await coachExecute(
    db,
    president,
    {
      action: "requestCourse",
      profileId: people.coach,
      courseId: courses["Initiateur powerchair football"],
      note: "Formation suivie en mars (attestation disponible).",
    },
    org,
  );
  await coursesExecute(
    db,
    fed,
    {
      action: "decide",
      id: firstRequest.id,
      decision: "approved",
      note: "",
      completedOn: day(-200),
    },
    federation,
  );
  await coachExecute(
    db,
    president,
    {
      action: "requestCourse",
      profileId: people.coach,
      courseId: courses["Premiers secours sport adapté"],
      note: "",
    },
    org,
  );

  // 13. Matches: a league game played two weeks ago (line-up, statistics,
  // referee report) and the next league game with a referee to confirm.
  const refUser =
    (
      await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [
        refereeAccount.email,
      ])
    ).rows[0]?.id ??
    (
      await auth.api.signUpEmail({
        body: {
          email: refereeAccount.email,
          name: refereeAccount.name,
          password: DEMO_PASSWORD,
        },
      })
    ).user.id;
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [federation, refUser],
  );
  const refMandate = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,created_by) VALUES($1,$2,'referee',$3) RETURNING id",
      [federation, refUser, fedUser],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO user_profile(user_id,mandate_id,name,is_default) VALUES($1,$2,$3,true)",
    [refUser, refMandate, refereeAccount.profile],
  );
  const referee = await principal(refUser, refMandate);
  const fixture = async (offset: number, opponent: string, home: boolean) =>
    (
      await matchExecute(
        db,
        president,
        {
          action: "create",
          teamId: team,
          opponent,
          home,
          kind: "league",
          competition: "Championnat BPCF D1",
          startsAt: `${day(offset)}T14:00`,
          venue: home ? "Hall sportif du Parc" : "",
          calendarEventId: null,
          notes: "",
        },
        org,
      )
    ).id;
  const played = await fixture(-14, "Liège Lions", true);
  const lineup = [
    [people.yanis, true, "Gardien", 1],
    [people.camille, true, "Attaquante", 7],
    [people.lucas, true, "Défenseur", 4],
    [people.emma, true, "Défenseuse", 9],
    [people.thomas, false, "Attaquant", 11],
  ] as const;
  await matchExecute(
    db,
    president,
    {
      action: "lineup",
      id: played,
      players: lineup.map(([profileId, starter, position, jerseyNumber]) => ({
        profileId,
        starter,
        position,
        jerseyNumber,
      })),
    },
    org,
  );
  const minutes = [40, 40, 40, 32, 8];
  const goals = [0, 2, 0, 0, 1];
  await matchExecute(
    db,
    president,
    {
      action: "result",
      id: played,
      version: 1,
      ourScore: 3,
      theirScore: 1,
      stats: lineup.map(([profileId], i) => ({
        profileId,
        minutes: minutes[i],
        goals: goals[i],
        assists: i === 3 ? 2 : 0,
        yellowCards: i === 2 ? 1 : 0,
        redCard: false,
      })),
    },
    org,
  );
  const upcomingMatch = await fixture(5, "Gand Wheels", false);
  for (const [matchId, accept] of [
    [played, true],
    [upcomingMatch, null],
  ] as const) {
    await designationExecute(
      db,
      fed,
      { action: "assign", matchId, refereeId: refUser, role: "main" },
      federation,
    );
    if (accept)
      await refereeExecute(
        db,
        referee,
        { action: "answer", matchId, accept: true },
        federation,
      );
  }
  await refereeExecute(
    db,
    referee,
    {
      action: "report",
      matchId: played,
      homeScore: 3,
      awayScore: 1,
      incidents:
        "Rencontre correcte. Un avertissement pour Lucas Peeters (contact).",
    },
    federation,
  );
  await refereeExecute(
    db,
    referee,
    {
      action: "availability",
      days: [day(5), day(6), day(12), day(13)].map((d, i) => ({
        day: d,
        available: i !== 2,
        note: "",
      })),
    },
    federation,
  );

  // 14. Licences and classifications with the BPCF, and a federation tournament.
  const licenceSeason = seasonOf(day(0)).label;
  await clubLicensesExecute(
    db,
    president,
    {
      action: "requestLicenses",
      season: licenceSeason,
      profileIds: [
        people.camille,
        people.yanis,
        people.thomas,
        people.lucas,
        people.emma,
      ],
    },
    org,
  );
  const firstTwo = (
    await db.query(
      "SELECT id FROM license WHERE profile_id=ANY($1::uuid[]) ORDER BY requested_at",
      [[people.camille, people.yanis]],
    )
  ).rows.map((r) => r.id as string);
  await federationLicensesExecute(
    db,
    fed,
    { action: "decideLicenses", ids: firstTwo, decision: "active", note: "" },
    federation,
  );
  for (const profileId of [people.camille, people.emma])
    await clubLicensesExecute(
      db,
      president,
      { action: "requestClassification", profileId },
      org,
    );
  await federationLicensesExecute(
    db,
    fed,
    {
      action: "decideClassification",
      profileId: people.camille,
      decision: "validated",
      classification: "PF2",
      validUntil: `${year + 2}-06-30`,
      note: "Classification confirmée lors du tournoi de septembre.",
    },
    federation,
  );
  await calendarExecute(
    db,
    fed,
    {
      action: "create",
      title: "Tournoi BPCF des jeunes",
      kind: "tournament",
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${next(6, 3)}T10:00`,
      localEnd: `${next(6, 3)}T17:00`,
      fold: "reject",
      teamId: null,
      placeId: null,
      freeLocation: "Complexe sportif de Louvain-la-Neuve",
      responsibleId: fedUser,
      visibility: "organization",
      equipment: "",
      instructions:
        "Inscriptions des équipes auprès de la BPCF avant la fin du mois.",
      participants: [],
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
    },
    federation,
  );

  // Wave 7: an adapted minibus, care instructions, a hall in the directory and
  // an away tournament with its participants, vehicle and schedule. Since
  // wave 17 (C4) the federation writes the halls' directory.
  const hall = await venueExecute(db, fed, {
    action: "save",
    name: "Hall omnisports de Gand",
    address: "Sportlaan 12",
    city: "Gent",
    phone: "09 000 00 00",
    website: "",
    stepFree: true,
    adaptedToilets: true,
    changingRooms: true,
    showers: null,
    lift: null,
    hoist: false,
    parking: true,
    charging: true,
    doorWidthCm: 95,
    floor: "Parquet",
    court: "28 x 15 m, lignes de basket",
    notes: "Entrée par le parking arrière, rampe à droite.",
    checkedOn: day(-30),
  });
  const minibus = await tripExecute(
    db,
    president,
    {
      action: "fleet",
      name: "Minibus adapté",
      kind: "Minibus avec lift",
      plate: "1-PCM-007",
      owner: "Club",
      seats: 8,
      wheelchairPlaces: 2,
      rampOrLift: true,
      licence: "D1",
      insuranceUntil: day(300),
      inspectionUntil: day(120),
      notes: "Sangles de fixation dans le coffre.",
      archived: false,
    },
    org,
  );
  await tripExecute(
    db,
    president,
    { action: "licence", profileId: people.coach, categories: ["B", "D1"], validUntil: day(2000) },
    org,
  );
  for (const [profile, care] of [
    [people.camille, { moment: "morning", time: "08:00", title: "Transfert au lève-personne", details: "Toujours à deux. Sangle verte." }],
    [people.camille, { moment: "after_play", time: "", title: "Hydratation et changement de position", details: "Toutes les deux heures en journée." }],
    [people.lucas, { moment: "midday", time: "12:30", title: "Repas coupé en petits morceaux", details: "" }],
  ] as const)
    await playerProfileExecute(
      db,
      president,
      { action: "care", id: profile, active: true, ...care },
      org,
    );
  const trip = await tripExecute(
    db,
    president,
    {
      action: "create",
      locale: "fr",
      title: "Tournoi de Gand",
      kind: "tournament",
      startsOn: day(12),
      endsOn: day(13),
      sharedVenueId: hall.id,
      placeId: null,
      destination: "",
      meetingPoint: "Parking du club",
      departureAt: `${day(12)}T06:30:00Z`,
      returnAt: `${day(13)}T18:00:00Z`,
      returnPoint: "Parking du club",
      accommodation: "Auberge de jeunesse De Draecke, chambres adaptées au rez-de-chaussée",
      accommodationAccessible: true,
      emergency: "112. Hôpital universitaire de Gand, C. Heymanslaan 10.",
      contact: "Sam Leroy, 0470 12 34 56",
      notes: "Prévoir les chargeurs des fauteuils de jeu.",
    },
    org,
  );
  await tripExecute(
    db,
    president,
    {
      action: "addParticipants",
      tripId: trip.id,
      people: [
        { profileId: people.camille, role: "player" },
        { profileId: people.lucas, role: "player" },
        { profileId: people.yanis, role: "player" },
        { profileId: people.coach, role: "coach" },
        { profileId: people.nadia, role: "guardian" },
      ],
    },
    org,
  );
  const travellers = (
    await db.query(
      "SELECT id,profile_id FROM trip_participant WHERE trip_id=$1",
      [trip.id],
    )
  ).rows as { id: string; profile_id: string }[];
  const pid = (profile: string) => travellers.find((r) => r.profile_id === profile)!.id;
  for (const [profile, chair] of [
    [people.camille, "powerchair"],
    [people.lucas, "powerchair"],
    [people.yanis, "manual"],
  ] as const)
    await tripExecute(
      db,
      president,
      { action: "participant", participantId: pid(profile), status: "confirmed", chair, needs: profile === people.camille ? "Chargeur 24 V" : "" },
      org,
    );
  await tripExecute(
    db,
    president,
    {
      action: "vehicle",
      tripId: trip.id,
      vehicleId: minibus.id,
      name: "Minibus adapté",
      legs: "both",
      driverProfileId: people.coach,
      driverPhone: "0470 12 34 56",
      seats: 8,
      wheelchairPlaces: 2,
      notes: "",
      passengers: [pid(people.camille), pid(people.lucas), pid(people.yanis)],
    },
    org,
  );
  for (const item of [
    { day: day(12), time: "07:30", title: "Départ du club", place: "Parking du club" },
    { day: day(12), time: "10:00", title: "Match contre Gand", place: "Terrain 1" },
    { day: day(12), time: "15:00", title: "Match contre Liège", place: "Terrain 2" },
    { day: day(13), time: "10:30", title: "Demi-finale", place: "Terrain 1" },
    { day: day(13), time: "17:00", title: "Retour", place: "" },
  ])
    await tripExecute(
      db,
      president,
      { action: "schedule", tripId: trip.id, notes: "", ...item },
      org,
    );

  // Wave 8: official details for attestations, a fundraising pot, an
  // announced absence and the sibling discount on the dues plans.
  await db.query(
    "UPDATE organization SET address=$2,company_number=$3,signatory=$4 WHERE id=$1",
    [org, "Rue du Stade 1, 1300 Wavre", "0712.345.678", "Alex Martin, président"],
  );
  await db.query(
    "UPDATE dues_plan SET sibling_second_percent=20,sibling_next_percent=30 WHERE organization_id=$1",
    [org],
  );
  const support = await fundraisingExecute(
    db,
    president,
    { action: "group", name: "Comité de soutien", description: "Parents et amis du club.", archived: false },
    org,
  );
  const chairs = await fundraisingExecute(
    db,
    president,
    {
      action: "pot",
      groupId: support.id,
      name: "Deux fauteuils de jeu",
      description: "Deux fauteuils de powerchair football pour les jeunes qui commencent.",
      goalCents: 3600000,
      deadline: day(240),
      status: "open",
    },
    org,
  );
  for (const [kind, label, amount, donor] of [
    ["action", "Souper spaghetti", 284000, ""],
    ["expense", "Courses du souper", 61000, ""],
    ["sponsor", "Garage Dubois", 250000, "Garage Dubois"],
    ["donation", "Don", 15000, "Famille Peeters"],
  ] as const)
    await fundraisingExecute(
      db,
      president,
      { action: "movement", potId: chairs.id, occurredOn: day(-20), kind, label, amountCents: amount, donor, anonymous: false },
      org,
    );
  await fundraisingExecute(db, president, { action: "publish", potId: chairs.id, public: true }, org);
  await absenceExecute(
    db,
    president,
    {
      action: "declare",
      profileId: people.yanis,
      startsOn: day(1),
      endsOn: day(15),
      reason: "chair",
      comment: "Fauteuil électrique en réparation chez le fournisseur.",
    },
    org,
  );

  await seedTournaments(db, CLUB, FEDERATION, refereeAccount.email);
  // Wave 16 (E1): the demo events take the club's type matching their kind.
  await db.query("UPDATE calendar_event e SET event_type_id=(SELECT t.id FROM event_type t WHERE t.organization_id=e.organization_id AND t.legacy_kind=e.kind ORDER BY t.position LIMIT 1) WHERE e.event_type_id IS NULL");
  console.log(`« ${CLUB} » est prêt.`);
  printAccounts();
} finally {
  for (const id of sessions) {
    await db.query("DELETE FROM active_context WHERE session_id=$1", [id]);
    await db.query("DELETE FROM session WHERE id=$1", [id]);
  }
  await db.end();
}

/**
 * The demo accounts follow PFM_DEMO_PASSWORD: when the project's secret
 * changes (a forgotten value cannot be read back from Vercel), the next
 * preview build gives the existing demo accounts the new one. Only the
 * accounts of this script (@demo.pfm), only with the project's own secret,
 * never in production (refused above).
 */
async function alignPasswords() {
  if (!ownPassword) return;
  const context = await auth.$context;
  const emails = [...accounts, federationAccount, refereeAccount].map((a) => a.email);
  const rows = (
    await db.query(
      'SELECT a.id,a.password,u.id AS user_id FROM account a JOIN "user" u ON u.id=a."userId" WHERE a."providerId"=\'credential\' AND lower(u.email)=ANY($1::text[])',
      [emails],
    )
  ).rows as { id: string; password: string | null; user_id: string }[];
  let changed = 0;
  for (const r of rows) {
    if (r.password && (await context.password.verify({ hash: r.password, password: DEMO_PASSWORD }))) continue;
    await db.query("UPDATE account SET password=$1,\"updatedAt\"=now() WHERE id=$2", [await context.password.hash(DEMO_PASSWORD), r.id]);
    // Sessions opened with the old password end.
    await db.query('DELETE FROM session WHERE "userId"=$1', [r.user_id]);
    changed++;
  }
  if (changed) console.log(`Mot de passe des comptes de démonstration aligné sur PFM_DEMO_PASSWORD (${changed}).`);
}

function printAccounts() {
  console.log(
    ownPassword
      ? "\nComptes de démonstration (mot de passe : celui de PFM_DEMO_PASSWORD)"
      : `\nComptes de démonstration (mot de passe : ${DEMO_PASSWORD})`,
  );
  for (const a of [...accounts, federationAccount, refereeAccount])
    console.log(`  ${a.email.padEnd(22)} ${a.profile}`);
  console.log("\nConnexion : /fr/access\n");
}
